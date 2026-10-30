import { FileIO, AppLike } from '../utilities/FileIO';
import { ROLES } from '../roles';
import { buildPathNormalizer } from '../utilities/ActivityLinks';
import {
	contextPagePath,
	contextsFolderForNote,
	matchContextPagePath,
} from '../utilities/ContextPaths';
import {
	ActivityIndexEntry,
	ExternalWorkRequest,
	ExternalWorkResult,
	SourceConflict,
	applySources,
	buildActivityContent,
	contextPageTemplate,
	finishTodos,
	findSourceConflicts,
	ownersOf,
	parseSourceUrls,
	resolveActivityName,
	sourceMeta,
	upsertActivityBlock,
	validateRequest,
} from '../components/ExternalWork';
import {
	WorkdayPlanRequest,
	WorkdayPlanResult,
	renderPlanRegion,
	resolvePlan,
	upsertPlanRegion,
	validatePlanRequest,
} from '../components/WorkdayPlan';

function planError(code: string, message: string, contextPath?: string): WorkdayPlanResult {
	return { status: 'error', code, message, contextPath, placed: 0, omitted: 0, unresolved: [], conflicts: [], warnings: [] };
}

export interface ExternalWorkSettings {
	journalFolder: string;
	activitiesFolder: string;
	archiveFolder: string;
}

export interface ExternalWorkDeps {
	/** Where the daily note for `date` belongs, for anchoring a Contexts folder when it does not exist. */
	dailyNotePathForDate(date: string): string;
	/**
	 * Creates and fully builds today's daily note through the canonical pipeline
	 * (never a hand-made file). Called only for today's date, only when the note
	 * is missing. Resolves with the built note; rejects when it cannot be provisioned.
	 */
	provisionDailyNote?(app: AppLike, date: string): Promise<{ path: string; basename: string }>;
	/** Adds the "🧭 Contexts:" link to an existing, fully built daily note. */
	linkContext?(app: AppLike, dailyNote: { path: string; basename: string }, role: string, date: string): Promise<void>;
}

export interface EnsureContextResult {
	status: 'created' | 'exists' | 'error';
	code?: string;
	message?: string;
	path?: string;
	dailyNotePath?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function localDate(): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The plugin's deterministic, offline entry point for automation (skills,
 * scripts): ensure a Context page for an explicit date + role, and upsert
 * externally sourced work into it. The plugin is the sole owner of Context
 * creation and of Activity-block merge rules — callers pass facts, never
 * file contents, so nothing races a rebuild or invents incompatible scaffolding.
 *
 * Calls are serialised: two overlapping requests never interleave their
 * read-modify-write cycles on the same page.
 */
export class ExternalWorkComposer {
	private fileIO = new FileIO();
	private chain: Promise<unknown> = Promise.resolve();

	constructor(private settings: ExternalWorkSettings, private deps: ExternalWorkDeps) {}

	ensureContext(app: AppLike, date: string, role: string): Promise<EnsureContextResult> {
		return this.serial(() => this.ensureContextNow(app, date, role));
	}

	upsertExternalWork(
		app: AppLike,
		payload: ExternalWorkRequest | ExternalWorkRequest[]
	): Promise<ExternalWorkResult[]> {
		const requests = Array.isArray(payload) ? payload : [payload];
		return this.serial(async () => {
			const index = await this.loadIndex(app);
			const results: ExternalWorkResult[] = [];
			for (const req of requests) {
				try {
					results.push(await this.upsertOne(app, req, index));
				} catch (e) {
					results.push({ status: 'error', code: 'exception', message: (e as Error).message, warnings: [] });
				}
			}
			return results;
		});
	}

	/** Every source URL owned by more than one Activity, vault-wide. */
	async reportSourceConflicts(app: AppLike): Promise<SourceConflict[]> {
		return this.serial(async () => findSourceConflicts(await this.loadIndex(app)));
	}

	/**
	 * Publishes the plan overview (the reading surface) into the Context page,
	 * above `## Activities`. Items are resolved to the user-owned Activities by
	 * canonical URL; only this kind/date/role's plan region is replaced.
	 */
	upsertWorkdayPlan(app: AppLike, req: WorkdayPlanRequest): Promise<WorkdayPlanResult> {
		return this.serial(async () => {
			try {
				return await this.upsertPlanNow(app, req);
			} catch (e) {
				return planError('exception', (e as Error).message);
			}
		});
	}

	private async upsertPlanNow(app: AppLike, req: WorkdayPlanRequest): Promise<WorkdayPlanResult> {
		const v = validatePlanRequest(req, ROLES as readonly string[]);
		if (!v.ok) return planError(v.code, v.message);

		const index = await this.loadIndex(app);
		const resolved = resolvePlan(v.items, index, v.maxItems, v.unlinked);

		const ctx = await this.ensureContextNow(app, req.date, v.role);
		if (ctx.status === 'error' || !ctx.path) {
			return planError(ctx.code ?? 'context-unavailable', ctx.message ?? 'Context page unavailable.');
		}
		const page = await this.fileIO.loadFile(app, ctx.path);
		if (page === null) return planError('context-unreadable', `${ctx.path} could not be read.`, ctx.path);

		const omitted = v.omitted + resolved.truncated;
		const region = renderPlanRegion(req.kind, req.date, v.role, resolved.lines, omitted, v.failures, resolved.unlinkedLines);
		const updated = upsertPlanRegion(page, req.kind, req.date, v.role, region);
		if (updated === null) {
			return planError('plan-region-damaged', `The ${req.kind} plan markers in ${ctx.path} are damaged; nothing was changed.`, ctx.path);
		}
		const changed = updated !== page;
		if (changed) await this.fileIO.saveFile(app, ctx.path, updated);

		const warnings: string[] = [];
		if (resolved.unresolved.length > 0) warnings.push(`${resolved.unresolved.length} item(s) were not linked.`);
		if (resolved.conflicts.length > 0) warnings.push(`${resolved.conflicts.length} URL(s) are owned by several Activities and were skipped.`);
		return {
			status: changed ? 'updated' : 'unchanged',
			contextPath: ctx.path,
			placed: resolved.lines.length + resolved.unlinkedLines.length,
			unlinkedPlaced: resolved.unlinkedLines.length,
			omitted,
			unresolved: resolved.unresolved,
			conflicts: resolved.conflicts,
			warnings,
		};
	}

	// ── Context ──────────────────────────────────────────────────────────

	private async ensureContextNow(app: AppLike, date: string, role: string): Promise<EnsureContextResult> {
		if (!DATE_RE.test(date) || isNaN(Date.parse(date))) {
			return { status: 'error', code: 'bad-date', message: `Invalid date "${date}".` };
		}
		if (!(ROLES as readonly string[]).includes(role)) {
			return { status: 'error', code: 'bad-role', message: `Unknown role "${role}".` };
		}
		const limit = [this.fileIO.todayDate(), localDate()].sort().pop()!;
		if (date > limit) {
			return { status: 'error', code: 'future-date', message: `${date} is in the future.` };
		}

		const findNote = () => app.vault.getFiles().find(f =>
			f.path.startsWith(this.settings.journalFolder + '/') &&
			f.basename === date &&
			!matchContextPagePath(f.path, this.settings.journalFolder, ROLES as readonly string[])
		);
		let dailyNote: { path: string; basename: string } | undefined = findNote();
		const isToday = date === this.fileIO.todayDate() || date === localDate();
		// Only today's note is ever provisioned; a missing historical note is history, not a gap to fill.
		if (!dailyNote && isToday && this.deps.provisionDailyNote) {
			try {
				dailyNote = await this.deps.provisionDailyNote(app, date);
			} catch (e) {
				return {
					status: 'error',
					code: 'daily-note-unavailable',
					message: `Could not provision today's daily note: ${(e as Error).message}`,
				};
			}
		}
		const anchor = dailyNote?.path ?? this.deps.dailyNotePathForDate(date);
		const folder = contextsFolderForNote(anchor);
		const path = contextPagePath(folder, date, role);

		await this.ensureFolders(app, folder);

		const template = contextPageTemplate(role, date, dailyNote ? anchor : null);
		const existing = app.vault.getAbstractFileByPath(path);
		let status: EnsureContextResult['status'] = 'exists';
		if (!existing) {
			try {
				await app.vault.create(path, template);
				status = 'created';
			} catch (e) {
				if (!((e as Error).message ?? '').includes('already exists')) {
					return { status: 'error', code: 'create-failed', message: (e as Error).message, path };
				}
			}
		} else if ((await app.vault.read(existing)).trim().length === 0) {
			await app.vault.modify(existing, template);
			status = 'created';
		}

		if (dailyNote && this.deps.linkContext) {
			try {
				await this.deps.linkContext(app, { path: dailyNote.path, basename: dailyNote.basename }, role, date);
			} catch (e) {
				console.error('[2ndBrain] linkContext failed:', e);
			}
		}
		return { status, path, dailyNotePath: dailyNote?.path ?? null };
	}

	private async ensureFolders(app: AppLike, folder: string): Promise<void> {
		const parts = folder.split('/');
		for (let i = 1; i <= parts.length; i++) {
			const sub = parts.slice(0, i).join('/');
			if (app.vault.getAbstractFileByPath(sub)) continue;
			try {
				await app.vault.createFolder(sub);
			} catch (e) {
				if (!((e as Error).message ?? '').includes('already exists')) throw e;
			}
		}
	}

	// ── Upsert ───────────────────────────────────────────────────────────

	private async upsertOne(
		app: AppLike,
		req: ExternalWorkRequest,
		index: ActivityIndexEntry[]
	): Promise<ExternalWorkResult> {
		const warnings: string[] = [];
		const v = validateRequest(req, ROLES as readonly string[]);
		if (!v.ok) return { status: 'error', code: v.code, message: v.message, warnings };
		const { role, sources } = v;
		const urls = sources.map(s => s.url);

		const owners = ownersOf(index, urls);
		let conflicts = findSourceConflicts(index, urls);
		if (conflicts.length === 0 && owners.length > 1) {
			conflicts = urls
				.map(url => ({ url, owners: owners.filter(o => o.sourceUrls.includes(url)).map(o => o.path) }))
				.filter(c => c.owners.length > 0);
		}
		if (conflicts.length > 0) {
			return {
				status: 'conflict',
				code: 'source-conflict',
				message: 'A source URL is owned by more than one Activity. Nothing was changed; resolve it by hand.',
				conflicts,
				warnings,
			};
		}

		const entries = sources.map(s => ({ url: s.url, title: s.title, meta: sourceMeta(s) }));
		const owner = owners[0];
		let activityPath: string;
		let created = false;

		if (owner) {
			if (owner.archived) {
				return {
					status: 'skipped', code: 'archived-activity', activityPath: owner.path, warnings,
					message: `${owner.path} owns this source but is archived; not resurrected.`,
				};
			}
			if (owner.stage === 'done' && req.kind !== 'evening') {
				return {
					status: 'skipped', code: 'activity-done', activityPath: owner.path, warnings,
					message: `${owner.path} is done; only an evening review is written to a finished Activity.`,
				};
			}
			activityPath = owner.path;
			await this.refreshActivity(app, owner, entries, role, warnings);
		} else {
			const createIfMissing = req.activity.createIfMissing ?? req.kind !== 'evening';
			if (!createIfMissing) {
				return {
					status: 'skipped', code: 'no-activity', warnings,
					message: 'No Activity owns these sources and createIfMissing is false.',
				};
			}
			const taken = new Set(app.vault.getFiles().map(f => f.name.toLowerCase()));
			const name = resolveActivityName(
				req.activity.title.trim(), (req.activity.qualifier ?? '').trim(), sources,
				n => taken.has(`${n}.md`.toLowerCase())
			);
			if (!name.ok) return { status: 'error', code: name.code, message: name.message, warnings };

			activityPath = `${this.settings.activitiesFolder}/${name.name}.md`;
			await this.ensureFolders(app, this.settings.activitiesFolder);
			await app.vault.create(activityPath, buildActivityContent({
				date: req.date,
				role,
				takeToWork: req.activity.takeToWork ?? req.kind !== 'evening',
				sources: entries,
			}));
			created = true;
			index.push({
				path: activityPath, basename: name.name, sourceUrls: urls,
				archived: false, role, stage: 'doing',
			});
		}

		const basename = activityPath.split('/').pop()!.replace(/\.md$/, '');
		const ctx = await this.ensureContextNow(app, req.date, role);
		if (ctx.status === 'error' || !ctx.path) {
			return { status: 'error', code: ctx.code, message: ctx.message, activityPath, createdActivity: created, warnings };
		}

		const page = await this.fileIO.loadFile(app, ctx.path);
		if (page === null) {
			return { status: 'error', code: 'context-unreadable', activityPath, createdActivity: created, warnings };
		}
		const updated = upsertActivityBlock(page, {
			activityPath,
			displayName: basename,
			kind: req.kind,
			summary: req.summary ?? [],
			todos: finishTodos(v.todos, basename),
			sourceUrls: v.sources.map(s => s.url),
			targetExists: p => !!app.vault.getAbstractFileByPath(p),
			normalizePath: buildPathNormalizer(app.vault.getFiles(), this.settings.activitiesFolder),
		});
		if (updated !== page) await this.fileIO.saveFile(app, ctx.path, updated);

		return {
			status: created ? 'created' : 'updated',
			activityPath,
			contextPath: ctx.path,
			createdActivity: created,
			warnings,
		};
	}

	/** Attaches new sources, refreshes upstream titles, fills a blank role. Never renames. */
	private async refreshActivity(
		app: AppLike,
		owner: ActivityIndexEntry,
		entries: Array<{ url: string; title: string; meta: string }>,
		role: string,
		warnings: string[]
	): Promise<void> {
		const content = await this.fileIO.loadFile(app, owner.path);
		if (content === null) return;

		let next = applySources(content, entries);
		if (!owner.role) {
			next = this.fileIO.upsertFrontmatterField(next, 'role', role);
			owner.role = role;
		} else if (owner.role !== role) {
			warnings.push(`${owner.path} has role "${owner.role}", not "${role}"; its role was left alone.`);
		}
		if (next !== content) await this.fileIO.saveFile(app, owner.path, next);
		for (const e of entries) if (!owner.sourceUrls.includes(e.url)) owner.sourceUrls.push(e.url);
	}

	private async loadIndex(app: AppLike): Promise<ActivityIndexEntry[]> {
		const { activitiesFolder, archiveFolder } = this.settings;
		const out: ActivityIndexEntry[] = [];
		for (const f of app.vault.getFiles()) {
			if (!f.path.startsWith(activitiesFolder + '/') || !f.path.endsWith('.md')) continue;
			if (f.path.startsWith(activitiesFolder + '/Workflow/')) continue;
			const handle = app.vault.getAbstractFileByPath(f.path);
			if (!handle) continue;
			const content = await app.vault.read(handle);
			out.push({
				path: f.path,
				basename: f.basename,
				sourceUrls: parseSourceUrls(content),
				archived: f.path.startsWith(archiveFolder + '/'),
				role: this.fileIO.parseFrontmatterField(content, 'role') ?? '',
				stage: this.fileIO.parseFrontmatterField(content, 'stage') ?? '',
			});
		}
		return out;
	}

	private serial<T>(fn: () => Promise<T>): Promise<T> {
		const run = this.chain.then(fn, fn);
		this.chain = run.catch(() => undefined);
		return run;
	}
}
