import { App, TFile } from 'obsidian';
import { FileIO, AppLike } from '../utilities/FileIO';
import { loadActivityRecords } from '../utilities/ActivityIndex';
import { loadProjectRecords } from '../utilities/ProjectIndex';
import { ProjectsDashboard } from '../components/ProjectsDashboard';
import { PeopleDashboard } from '../components/PeopleDashboard';
import { scanCommitments, isPersonPage, CommitmentCache } from '../utilities/CommitmentIndex';
import {
	HomeDashboard, HomeSummary, RoleStat, HealthSignal, greeting, longDate,
} from '../components/HomeDashboard';
import { JournalDay, buildLifeBalance, buildConsistency } from '../components/LifeStats';
import { renderRadar, renderConsistency } from './HomeCharts';
import {
	contextsFolderForNote, contextPagePath, matchContextPagePath, parseContextPageFilename,
} from '../utilities/ContextPaths';
import { ROLES } from '../roles';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface HomeViewSettings {
	activitiesFolder: string;
	archiveFolder: string;
	projectsFolder: string;
	journalFolder: string;
	dashboardsFolder: string;
	peopleFolder: string;
}

/** How Home reaches the commitment cache the plugin persists — shared with PeopleView. */
export interface CacheAccess {
	load(): CommitmentCache | null;
	save(cache: CommitmentCache): void;
}

/**
 * Live landing page rendered into a `2ndbrain-home` code block.
 *
 * Explicitly *not* a third dashboard. The matrix answers "what do I do
 * today" and the projects view answers "what needs a decision"; repeating
 * either here would only add a second place to read the same rows, and
 * would not fit a phone. Home answers the question neither one does — am I
 * balanced across my roles, and is the system itself healthy — then hands
 * off with a link. It is sized to be read in one glance in landscape on a
 * phone, so everything is counts and chips, never tables.
 */
export class HomeView {
	private fileIO = new FileIO();
	private dashboard = new HomeDashboard();
	private projects = new ProjectsDashboard();
	private people = new PeopleDashboard();

	constructor(
		private app: App,
		private settings: HomeViewSettings,
		private cache: CacheAccess
	) {}

	async render(container: HTMLElement): Promise<void> {
		container.empty();
		container.addClass('twobrain-home');

		const app = this.app as unknown as AppLike;
		const today = this.fileIO.todayDate();
		const allFiles = this.app.vault.getFiles();

		const dailyNote = this.findDailyNote(allFiles, today);
		const roleContextPaths = this.findRoleContextPaths(allFiles, dailyNote, today);

		const activities = await loadActivityRecords(
			app, this.settings.activitiesFolder, this.settings.archiveFolder
		);
		const projectRecords = await loadProjectRecords(app, this.settings.projectsFolder);
		const rows = this.projects.buildRows(activities, projectRecords, today);

		const journalFiles = allFiles
			.filter(f =>
				f.path.startsWith(this.settings.journalFolder + '/') &&
				!matchContextPagePath(f.path, this.settings.journalFolder, ROLES as readonly string[])
			)
			.map(f => ({ path: f.path, basename: f.basename }));

		const peopleSignals = await this.buildPeopleSignals(app, today);

		const summary = this.dashboard.buildSummary(
			today,
			dailyNote?.path ?? null,
			roleContextPaths,
			activities.map(a => ({
				role: a.role, project: a.project, stage: a.stage, takeToWork: a.takeToWork,
			})),
			rows.map(r => ({ role: r.role, health: r.health })),
			journalFiles,
			4,
			peopleSignals
		);

		this.renderBanner(container, summary);
		this.renderRoles(container, summary);
		this.renderSignals(container, summary);
		this.renderCharts(container, allFiles, today);
		this.renderFooter(container, summary);
	}

	// ── Sections ─────────────────────────────────────────────────────────────

	/** Zen banner: greeting, human date, and the single number that matters. */
	private renderBanner(container: HTMLElement, summary: HomeSummary): void {
		const banner = container.createDiv({ cls: 'twobrain-home-banner' });
		const text = banner.createDiv({ cls: 'twobrain-home-banner-text' });

		text.createDiv({
			cls: 'twobrain-home-greeting',
			text: greeting(new Date().getHours()),
		});
		text.createDiv({
			cls: 'twobrain-home-date',
			text: longDate(summary.today),
		});

		const count = banner.createDiv({ cls: 'twobrain-home-banner-count' });
		count.createDiv({
			cls: 'twobrain-home-bignum',
			text: String(summary.takenToday),
		});
		count.createDiv({
			cls: 'twobrain-home-bignum-label',
			text: `taken to work · ${summary.openTotal} open`,
		});
	}

	/** One compact card per role — the balance read. */
	private renderRoles(container: HTMLElement, summary: HomeSummary): void {
		const grid = container.createDiv({ cls: 'twobrain-home-roles' });
		for (const role of summary.roles) this.renderRoleCard(grid, role);
	}

	private renderRoleCard(grid: HTMLElement, role: RoleStat): void {
		const card = grid.createDiv({ cls: 'twobrain-home-role' });
		if (role.untouched) card.addClass('is-untouched');
		if (role.open === 0) card.addClass('is-clear');

		const head = card.createDiv({ cls: 'twobrain-home-role-head' });

		if (role.contextPath) {
			const link = head.createEl('a', {
				cls: 'twobrain-home-role-name',
				text: role.role,
				href: role.contextPath,
			});
			link.addClass('is-ready');
			link.addEventListener('click', evt => {
				evt.preventDefault();
				this.open(role.contextPath!);
			});
		} else {
			head.createSpan({ cls: 'twobrain-home-role-name', text: role.role });
		}

		if (role.needsDecision > 0) {
			head.createSpan({
				cls: 'twobrain-home-role-flag',
				text: `${role.needsDecision}`,
			}).setAttribute('title', `${role.needsDecision} project(s) need a decision`);
		}

		card.createDiv({
			cls: 'twobrain-home-role-count',
			text: role.open === 0 ? 'clear' : `${role.taken} / ${role.open}`,
		});

		// A proportion bar, not a progress bar: how much of this role's open
		// work you actually committed to today.
		const track = card.createDiv({ cls: 'twobrain-home-role-track' });
		const fillPct = role.open === 0 ? 0 : Math.round((role.taken / role.open) * 100);
		track.createDiv({ cls: 'twobrain-home-role-fill' })
			.setAttribute('style', `width: ${fillPct}%`);
	}

	/** System health — only what is actually wrong, or one calm all-clear line. */
	private renderSignals(container: HTMLElement, summary: HomeSummary): void {
		const row = container.createDiv({ cls: 'twobrain-home-signals' });

		if (summary.allClear) {
			row.createSpan({
				cls: 'twobrain-home-allclear',
				text: 'Everything is triaged. Nothing is asking for you.',
			});
			return;
		}

		for (const signal of summary.signals) this.renderSignal(row, signal);
	}

	private renderSignal(row: HTMLElement, signal: HealthSignal): void {
		const target = this.targetPath(signal.target);
		const chip = row.createEl('a', {
			cls: 'twobrain-home-signal',
			text: `${signal.count} ${signal.label}`,
			href: target,
		});
		chip.addClass(`is-${signal.id}`);
		chip.addEventListener('click', evt => {
			evt.preventDefault();
			this.open(target);
		});
	}

	/**
	 * The long view: role balance and whether the habit is holding. These are
	 * the only things on the page that aren't about today, and the only
	 * reason Home is worth opening on a day you've already planned.
	 */
	private renderCharts(container: HTMLElement, files: TFile[], today: string): void {
		const { days, paths } = this.collectJournalDays(files);
		const charts = container.createDiv({ cls: 'twobrain-home-charts' });

		renderRadar(charts, buildLifeBalance(today, days, ROLES as readonly string[]));
		renderConsistency(charts, buildConsistency(today, days), date => {
			const path = paths.get(date);
			if (path) this.open(path);
		});
	}

	/**
	 * A year of history from file metadata alone — no note is opened. The date
	 * comes from the filename, the roles from the Context pages sitting beside
	 * it, and the depth from the size on disk.
	 */
	private collectJournalDays(
		files: TFile[]
	): { days: JournalDay[]; paths: Map<string, string> } {
		const journalFolder = this.settings.journalFolder;
		const roles = ROLES as readonly string[];
		const byDate = new Map<string, JournalDay>();
		const paths = new Map<string, string>();

		const journal = files.filter(f => f.path.startsWith(journalFolder + '/'));

		for (const file of journal) {
			if (matchContextPagePath(file.path, journalFolder, roles)) continue;
			if (!DATE_RE.test(file.basename)) continue;
			byDate.set(file.basename, {
				date: file.basename,
				roles: [],
				size: file.stat?.size ?? 0,
			});
			paths.set(file.basename, file.path);
		}

		for (const file of journal) {
			if (!matchContextPagePath(file.path, journalFolder, roles)) continue;
			const parsed = parseContextPageFilename(file.name, roles);
			// A Context page whose daily note was deleted still counts as
			// attention — the work happened even if the day's note didn't survive.
			if (!parsed) continue;
			const day = byDate.get(parsed.date)
				?? { date: parsed.date, roles: [], size: 0 };
			day.roles.push(parsed.role);
			day.size += file.stat?.size ?? 0;
			byDate.set(parsed.date, day);
		}

		return { days: [...byDate.values()], paths };
	}

	/** Where to go next: today's note, planning, review, and a glance back. */
	private renderFooter(container: HTMLElement, summary: HomeSummary): void {
		const nav = container.createDiv({ cls: 'twobrain-home-nav' });

		if (summary.dailyNotePath) {
			this.navLink(nav, "Today's note", summary.dailyNotePath, 'is-primary');
		} else {
			nav.createSpan({
				cls: 'twobrain-home-nav-missing',
				text: 'No daily note yet',
			});
		}
		this.navLink(nav, 'Plan', this.targetPath('matrix'));
		this.navLink(nav, 'Projects', this.targetPath('projects'));
		this.navLink(nav, 'People', this.targetPath('people'));
		this.navLink(nav, 'Inbox', this.targetPath('inbox'));

		if (summary.recentJournal.length === 0) return;
		const recent = container.createDiv({ cls: 'twobrain-home-recent' });
		recent.createSpan({ cls: 'twobrain-home-recent-label', text: 'Recent' });
		for (const file of summary.recentJournal) {
			const link = recent.createEl('a', {
				cls: 'twobrain-home-recent-link',
				text: file.basename.slice(5), // MM-DD: the year is noise in a "recent" list
				href: file.path,
			});
			link.addEventListener('click', evt => {
				evt.preventDefault();
				this.open(file.path);
			});
		}
	}

	private navLink(nav: HTMLElement, label: string, path: string, cls?: string): void {
		const link = nav.createEl('a', { cls: 'twobrain-home-nav-link', text: label, href: path });
		if (cls) link.addClass(cls);
		link.addEventListener('click', evt => {
			evt.preventDefault();
			this.open(path);
		});
	}

	// ── Private ──────────────────────────────────────────────────────────────

	private targetPath(target: HealthSignal['target']): string {
		const { dashboardsFolder, projectsFolder } = this.settings;
		if (target === 'inbox') return `${projectsFolder}/Inbox.md`;
		if (target === 'matrix') return `${dashboardsFolder}/Eisenhower Matrix.md`;
		if (target === 'people') return `${dashboardsFolder}/People.md`;
		return `${dashboardsFolder}/Projects.md`;
	}

	/**
	 * Reuses the same mtime-cached scan the People dashboard runs, so Home
	 * never pays the cost of re-reading the journal — only a warm cache
	 * lookup once the dashboard (or an earlier Home render) has primed it.
	 */
	private async buildPeopleSignals(
		app: AppLike, today: string
	): Promise<{ aging: number; quiet: number }> {
		try {
			const scan = await scanCommitments(
				app, this.settings.journalFolder, this.settings.peopleFolder, this.cache.load()
			);
			if (scan.changed) this.cache.save(scan.cache);

			const pages = this.app.vault.getFiles()
				.filter(f => isPersonPage(f.path, this.settings.peopleFolder))
				.map(f => ({
					name: f.basename,
					path: f.path,
					archived: /\/Archive\//i.test(f.path),
				}));

			const rows = this.people.buildRows({
				commitments: scan.commitments, contact: scan.contact, pages, today,
			});
			const summary = this.people.summarize(rows);
			return { aging: summary.aging, quiet: summary.quiet };
		} catch (e) {
			// Relationship signals are a bonus, not core to Home — a parse
			// failure here shouldn't take down the whole landing page.
			console.error('[2ndBrain] people signals failed:', e);
			return { aging: 0, quiet: 0 };
		}
	}

	private findDailyNote(files: TFile[], today: string): TFile | null {
		const journalFolder = this.settings.journalFolder;
		return files.find(f =>
			f.path.startsWith(journalFolder + '/') &&
			f.basename === today &&
			!matchContextPagePath(f.path, journalFolder, ROLES as readonly string[])
		) ?? null;
	}

	/**
	 * Today's Context page for each role, if it's already been built. Doesn't
	 * create anything — creation stays owned by the daily-note pipeline and
	 * the "Open today's context page…" command, so this is read-only.
	 */
	private findRoleContextPaths(
		files: TFile[], dailyNote: TFile | null, today: string
	): Map<string, string | null> {
		const result = new Map<string, string | null>();
		const contextsFolder = dailyNote ? contextsFolderForNote(dailyNote.path) : null;

		for (const role of ROLES) {
			const expected = contextsFolder ? contextPagePath(contextsFolder, today, role) : null;
			const exists = expected ? files.some(f => f.path === expected) : false;
			result.set(role, exists ? expected : null);
		}
		return result;
	}

	private open(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
	}
}
