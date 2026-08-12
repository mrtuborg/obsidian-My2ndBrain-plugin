import { FileIO, AppLike, VaultFile } from '../utilities/FileIO';
import { NoteBlocksParser } from './NoteBlocksParser';
import { ACTIVITIES_BUILT_MARKER } from '../utilities/ActivitiesMarker';

const ACTIVITIES_FOLDER = 'Activities';
const ARCHIVE_FOLDER = 'Activities/Archive';
const PROJECTS_FOLDER = 'Projects';

export interface ActivitiesSettings {
	activitiesFolder: string;
	archiveFolder: string;
	projectsFolder?: string;
}

const TYPE_PRIORITY: Record<string, number> = {
	project: 1,
	inbox: 999,
};
const PRIORITY_ORDER: Record<string, number> = {
	'urgent-important': 1,
	'urgent-not-important': 2,
	'not-urgent-important': 3,
	'not-urgent-not-important': 4,
	high: 1,
	medium: 3,
	low: 4,
};

export class ActivitiesInProgress {
	private fileIO = new FileIO();
	private parser = new NoteBlocksParser();
	private activitiesFolder: string;
	private archiveFolder: string;
	private projectsFolder: string;

	constructor(settings?: ActivitiesSettings) {
		this.activitiesFolder = settings?.activitiesFolder ?? ACTIVITIES_FOLDER;
		this.archiveFolder = settings?.archiveFolder ?? ARCHIVE_FOLDER;
		this.projectsFolder = settings?.projectsFolder ?? PROJECTS_FOLDER;
	}

	/**
	 * Builds the daily note's Activities section: only activities with no
	 * linked project, or whose linked project has no `role:` set. Role-tagged
	 * activities live in their Contexts/<Role>/YYYY-MM-DD.md page instead —
	 * see runForRole().
	 */
	async run(app: AppLike, _existingPageContent: string): Promise<string> {
		const today = this.fileIO.todayDate();
		const activities = await this.loadEligibleActivities(app, today);
		if (activities.length === 0) return '';

		const roleByActivity = await this.computeRoles(app, activities);
		const unrolled = activities.filter(({ file }) => (roleByActivity.get(file.path) ?? []).length === 0);
		if (unrolled.length === 0) return '';

		return this.renderSection(unrolled);
	}

	/**
	 * Builds the Activities section for a single role's Contexts page: only
	 * activities linked to a Project whose `role:` matches. Used by
	 * ContextPageComposer to regenerate Contexts/YYYY-MM-DD-<Role>.md. Omits
	 * the hidden ACTIVITIES_BUILT_MARKER — the page's own "## Activities"
	 * heading already provides that context, and the marker is only needed
	 * as a freeze sentinel on the daily note itself.
	 */
	async runForRole(app: AppLike, role: string): Promise<string> {
		const today = this.fileIO.todayDate();
		const activities = await this.loadEligibleActivities(app, today);
		if (activities.length === 0) return '';

		const roleByActivity = await this.computeRoles(app, activities);
		const matched = activities.filter(({ file }) => (roleByActivity.get(file.path) ?? []).includes(role));
		if (matched.length === 0) return '';

		return this.renderSection(matched, { includeHeader: false });
	}

	/**
	 * Returns which roles currently have at least one qualifying activity for
	 * today. Used to proactively create/refresh only the Contexts pages that
	 * will actually have content, alongside the daily note build, instead of
	 * lazily on first visit.
	 */
	async rolesWithActivities(app: AppLike): Promise<Set<string>> {
		const today = this.fileIO.todayDate();
		const activities = await this.loadEligibleActivities(app, today);
		if (activities.length === 0) return new Set();

		const roleByActivity = await this.computeRoles(app, activities);
		const roles = new Set<string>();
		for (const list of roleByActivity.values()) {
			for (const role of list) roles.add(role);
		}
		return roles;
	}

	// ── Private ──────────────────────────────────────────────────────────────

	private async loadEligibleActivities(
		app: AppLike,
		today: string
	): Promise<Array<{ file: VaultFile; content: string; openTodos: string[] }>> {
		const files = app.vault.getFiles().filter(f =>
			f.path.startsWith(this.activitiesFolder + '/') &&
			!f.path.startsWith(this.archiveFolder + '/') &&
			!f.path.startsWith(this.activitiesFolder + '/Workflow/') &&
			f.path.endsWith('.md')
		);
		return this.filterActivities(app, files, today);
	}

	/**
	 * Maps each activity's file path to the role(s) of Project(s) that link to
	 * it (via a Project header block referencing the activity's filename — the
	 * same linkage ProjectDescriptionInjector uses). An empty array means the
	 * activity has no linked project, its linked project(s) have no role set,
	 * or the activity is a generic catch-all bucket (`type: inbox`, e.g.
	 * "Plan for Today") — those always stay in the daily note regardless of
	 * any role their container project happens to carry.
	 */
	private async computeRoles(
		app: AppLike,
		activities: Array<{ file: VaultFile; content: string; openTodos: string[] }>
	): Promise<Map<string, string[]>> {
		const projectFiles = app.vault.getFiles().filter(f =>
			f.path.startsWith(this.projectsFolder + '/') &&
			f.path.endsWith('.md')
		);

		const projectBlocks = await this.parser.run(
			app,
			projectFiles.map(f => ({ file: f })),
			null
		);

		const roleByProject = new Map<string, string>();
		for (const f of projectFiles) {
			const handle = app.vault.getAbstractFileByPath(f.path);
			if (!handle) continue;
			const content = await app.vault.read(handle);
			const role = this.fileIO.parseFrontmatterField(content, 'role');
			if (role) roleByProject.set(f.path, role);
		}

		const result = new Map<string, string[]>();
		for (const { file, content } of activities) {
			const type = this.fileIO.parseFrontmatterField(content, 'type') ?? 'project';
			if (type === 'inbox') {
				result.set(file.path, []);
				continue;
			}

			const tagId = file.basename;
			const linkedProjects = new Set<string>();
			for (const block of projectBlocks.blocks) {
				if (block.getAttribute('type') === 'header' && block.content.includes(tagId)) {
					linkedProjects.add(block.page);
				}
			}

			const roles = [...linkedProjects]
				.map(p => roleByProject.get(p))
				.filter((r): r is string => Boolean(r));
			result.set(file.path, roles);
		}
		return result;
	}

	private async filterActivities(
		app: AppLike,
		files: VaultFile[],
		today: string
	): Promise<Array<{ file: VaultFile; content: string; openTodos: string[] }>> {
		const results = [];

		for (const file of files) {
			const fileHandle = app.vault.getAbstractFileByPath(file.path);
			if (!fileHandle) continue;

			// Critical: read from raw file content, NOT metadataCache (invariant B.2.5)
			const content = await app.vault.read(fileHandle);

			// Skip oversized activities — reading/rendering their bulk into every
			// daily note isn't worth the memory/perf cost. See MAX_MANAGED_FILE_BYTES.
			if (this.fileIO.exceedsSizeLimit(content)) {
				console.warn(`[2ndBrain] Skipping oversized activity from daily note: ${file.path}`);
				continue;
			}

			// Only include explicitly active activities (not planning, inbox, backlog, done, etc.)
			const stage = this.fileIO.parseFrontmatterField(content, 'stage');
			if (stage !== 'doing') continue;

			// Require a valid YYYY-MM-DD startDate — excludes template files with
			// Templater placeholders like <% tp.date.now() %> and files with no date at all
			const startDate = this.fileIO.parseFrontmatterField(content, 'startDate');
			if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) continue;
			if (startDate > today) continue;

			const remind = this.fileIO.parseFrontmatterField(content, 'remind') ?? 'daily';
			if (!this.remindAllowsToday(remind)) continue;

			// snoozeUntil: YYYY-MM-DD — independent, temporary hide, e.g. for vacation.
			// Unlike `remind`, this doesn't change the activity's normal schedule;
			// it just suppresses it until the given date, then resumes as before.
			const snoozeUntil = this.fileIO.parseFrontmatterField(content, 'snoozeUntil');
			if (snoozeUntil && /^\d{4}-\d{2}-\d{2}$/.test(snoozeUntil) && today < snoozeUntil) continue;

			const openTodos = this.extractOpenTodos(content);
			results.push({ file, content, openTodos });
		}

		// Sort: type priority → priority field → startDate → filename
		results.sort((a, b) => {
			const typeA = this.fileIO.parseFrontmatterField(a.content, 'type') ?? 'project';
			const typeB = this.fileIO.parseFrontmatterField(b.content, 'type') ?? 'project';
			const tpA = TYPE_PRIORITY[typeA] ?? 50;
			const tpB = TYPE_PRIORITY[typeB] ?? 50;
			if (tpA !== tpB) return tpA - tpB;

			const prioA = PRIORITY_ORDER[this.fileIO.parseFrontmatterField(a.content, 'priority') ?? 'medium'] ?? 2;
			const prioB = PRIORITY_ORDER[this.fileIO.parseFrontmatterField(b.content, 'priority') ?? 'medium'] ?? 2;
			if (prioA !== prioB) return prioA - prioB;

			const sdA = this.fileIO.parseFrontmatterField(a.content, 'startDate') ?? '';
			const sdB = this.fileIO.parseFrontmatterField(b.content, 'startDate') ?? '';
			if (sdA !== sdB) return sdA < sdB ? -1 : 1;

			return a.file.basename.localeCompare(b.file.basename);
		});

		return results;
	}

	private extractOpenTodos(content: string): string[] {
		// Walk lines and collect only those in the ## Journal section
		const lines = content.split('\n');
		let inJournal = false;
		const journalLines: string[] = [];

		for (const line of lines) {
			if (/^## Journal\s*$/.test(line)) { inJournal = true; continue; }
			if (inJournal && /^## /.test(line)) break;
			if (inJournal) journalLines.push(line);
		}

		// Collect all open todo lines
		const openLines = journalLines
			.filter(l => /^\s*- \[ \] /.test(l))
			.map(l => l.trim());

		// Collect all done task texts
		const doneTexts = new Set(
			journalLines
				.filter(l => /^\s*- \[x\] /.test(l))
				.map(l => l.trim().slice('- [x] '.length))
		);

		// Filter out todos whose text has a matching done entry,
		// and deduplicate — same todo text may appear across many journal date-sections
		const seen = new Set<string>();
		return openLines.filter(l => {
			const text = l.slice('- [ ] '.length);
			if (doneTexts.has(text)) return false;
			if (seen.has(text)) return false;
			seen.add(text);
			return true;
		});
	}

	private remindAllowsToday(remind: string): boolean {
		const now = new Date();
		const day = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
		switch (remind) {
			case 'weekdays': return day >= 1 && day <= 5;
			case 'weekends': return day === 0 || day === 6;
			case 'monday':   return day === 1;
			case 'tuesday':  return day === 2;
			case 'wednesday':return day === 3;
			case 'thursday': return day === 4;
			case 'friday':   return day === 5;
			case 'saturday': return day === 6;
			case 'sunday':   return day === 0;
			default: {
				// YYYY-MM or YYYY-MM-DD — show only from that date onward
				if (/^\d{4}-\d{2}(-\d{2})?$/.test(remind)) {
					const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
					const threshold = remind.length === 7 ? remind + '-01' : remind;
					return todayStr >= threshold;
				}
				return true; // daily or unknown
			}
		}
	}

	private renderSection(
		activities: Array<{ file: VaultFile; openTodos: string[] }>,
		opts?: { includeHeader?: boolean }
	): string {
		const includeHeader = opts?.includeHeader ?? true;
		const lines: string[] = includeHeader
			? ['----', '', ACTIVITIES_BUILT_MARKER, '----']
			: ['----'];

		for (const { file, openTodos } of activities) {
			const displayName = file.basename;
			lines.push(`##### [[${file.path}|${displayName}]]`);
			for (const todo of openTodos) {
				lines.push(todo);
			}
			lines.push('----');
		}

		return lines.join('\n');
	}
}
