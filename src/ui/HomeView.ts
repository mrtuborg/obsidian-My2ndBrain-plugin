import { App, Notice, TFile } from 'obsidian';
import { FileIO, AppLike } from '../utilities/FileIO';
import { loadActivityRecords } from '../utilities/ActivityIndex';
import { loadProjectRecords } from '../utilities/ProjectIndex';
import { ProjectsDashboard } from '../components/ProjectsDashboard';
import { PeopleDashboard, PersonRow } from '../components/PeopleDashboard';
import { UNASSIGNED, DIRECTION_LABEL } from '../components/Commitments';
import { scanCommitments, isPersonPage, CommitmentCache } from '../utilities/CommitmentIndex';
import {
	ContactChecklist, Checklist, ChecklistEntry, ContactStatus, CONTACT_STATUS_LABEL,
	DEFAULT_OVERDUE_DAYS,
} from '../components/ContactChecklist';
import { personStatus, setPersonStatus, isArchivedPath } from '../utilities/PersonStatus';
import { createTodaysDailyNote } from '../utilities/DailyNoteCreate';
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
	/** Days of silence before an active contact is flagged. */
	contactOverdueDays?: number;
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
	private checklist = new ContactChecklist();

	private container: HTMLElement | null = null;
	/** Folds survive a re-render, so checking someone off doesn't close the list. */
	private open_ = { inactive: false, archived: false };
	/** Status writes the metadata cache has not reflected yet. */
	private pending = new Map<string, ContactStatus>();

	constructor(
		private app: App,
		private settings: HomeViewSettings,
		private cache: CacheAccess
	) {}

	async render(container: HTMLElement): Promise<void> {
		this.container = container;
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

		const people = await this.buildPeopleSignals(app, today);

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
			people.signals
		);

		this.renderBanner(container, summary);
		this.renderRoles(container, summary);
		this.renderSignals(container, summary);
		this.renderChecklist(container, people.rows, today, dailyNote);
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

	/**
	 * The communication checklist: who to reach out to, and a way to say you did.
	 *
	 * The health signals above only fire when something is wrong, so on a good
	 * week relationships vanished from Home entirely — which is exactly when a
	 * quiet drift starts. This section is unconditional, and it is names rather
	 * than counts, because a name is something you can act on and "2 in touch"
	 * isn't.
	 *
	 * It earns its place on a page that refuses to be a third dashboard by
	 * being the only thing here you can *do* something with. Everything else on
	 * Home reports; this one closes a loop, in one tap, without leaving the page.
	 */
	private renderChecklist(
		container: HTMLElement, rows: PersonRow[], today: string, dailyNote: TFile | null
	): void {
		const list = this.checklist.build({
			rows,
			statusOf: path => this.statusOf(path),
			overdueAfterDays: this.settings.contactOverdueDays ?? DEFAULT_OVERDUE_DAYS,
			today,
			exclude: new Set([UNASSIGNED]),
		});

		const total = list.active.length + list.inactive.length + list.archived.length;
		if (total === 0) return;

		const box = container.createDiv({ cls: 'twobrain-home-people' });
		this.renderChecklistHead(box, list, dailyNote);

		if (list.active.length === 0) {
			box.createDiv({
				cls: 'twobrain-home-people-none',
				text: 'No active contacts. Restore someone below to start a rotation.',
			});
		}

		// Every active contact, always. A checklist you have to unfold to
		// finish is a checklist you stop finishing, and the people who get
		// truncated are by definition the ones you have neglected longest.
		// Length is controlled by filing people, not by hiding them.
		const body = box.createDiv({ cls: 'twobrain-home-checklist' });
		for (const entry of list.active) this.renderChecklistRow(body, entry, dailyNote);

		this.renderFiled(box, 'inactive', list.inactive, dailyNote);
		this.renderFiled(box, 'archived', list.archived, dailyNote);
	}

	private renderChecklistHead(box: HTMLElement, list: Checklist, dailyNote: TFile | null): void {
		const head = box.createDiv({ cls: 'twobrain-home-people-head' });
		head.createSpan({ cls: 'twobrain-home-people-label', text: 'People' });

		const parts: string[] = [];
		if (list.overdue > 0) parts.push(`${list.overdue} to reach out to`);
		if (list.logged > 0) parts.push(`${list.logged} logged today`);
		if (parts.length === 0) parts.push('all caught up');

		const count = head.createSpan({
			cls: 'twobrain-home-people-count',
			text: parts.join(' · '),
		});
		if (list.overdue > 0) count.addClass('is-overdue');

		// Say why the boxes are dead, and offer the one action that fixes it.
		// A `title` tooltip explains it on desktop and nowhere at all on a
		// phone, which is where a missing daily note is most likely to be met.
		if (!dailyNote && list.active.length > 0) {
			const note = box.createDiv({ cls: 'twobrain-home-checklist-note' });
			note.createSpan({ text: 'No note for today yet, so there is nothing to tick off into. ' });

			const create = note.createEl('button', {
				cls: 'twobrain-home-checklist-create',
				text: "Create today's note",
			});
			create.setAttribute('title',
				'Creates it where your daily notes settings put it, then opens it so it gets filled in');
			create.addEventListener('click', () => {
				create.disabled = true;
				void this.createDailyNote();
			});
		}
	}

	/**
	 * Creates today's daily note, which the plugin then fills on open.
	 *
	 * No re-render afterwards: creating the note opens it, so this view is no
	 * longer the thing on screen, and it rebuilds from scratch the next time
	 * Home is opened anyway.
	 */
	private async createDailyNote(): Promise<void> {
		const created = await createTodaysDailyNote(this.app, this.settings.journalFolder);
		if (!created) await this.rerender();
	}

	/**
	 * Inactive and archived contacts, folded away.
	 *
	 * Folded because the point of filing someone is that you stop seeing them,
	 * and a section you have to scroll past every morning is not filed. The
	 * restore button lives on the row rather than the heading so the list
	 * stays scannable — you unfold, find the name, and put them back.
	 */
	private renderFiled(
		box: HTMLElement, status: 'inactive' | 'archived',
		entries: ChecklistEntry[], dailyNote: TFile | null
	): void {
		if (entries.length === 0) return;
		const label = `${CONTACT_STATUS_LABEL[status]} · ${entries.length}`;
		const fold = this.renderFold(box, status, label, entries.length);
		const inner = fold.createDiv({ cls: 'twobrain-home-checklist' });
		for (const entry of entries) this.renderChecklistRow(inner, entry, dailyNote);
	}

	/**
	 * A `<details>` whose open state survives the re-render a button triggers.
	 *
	 * Without this, restoring the third name in a folded archive of forty
	 * slams the fold shut and you have to find your place again — which is
	 * the whole interaction the user asked for, broken.
	 */
	private renderFold(
		box: HTMLElement, key: keyof typeof this.open_, label: string, count: number
	): HTMLDetailsElement {
		const fold = box.createEl('details', { cls: 'twobrain-home-fold' });
		fold.open = this.open_[key];
		const summary = fold.createEl('summary', { cls: 'twobrain-home-fold-summary' });
		summary.setText(label);
		summary.setAttribute('aria-label', `${label} (${count})`);
		fold.addEventListener('toggle', () => { this.open_[key] = fold.open; });
		return fold;
	}

	private renderChecklistRow(
		body: HTMLElement, entry: ChecklistEntry, dailyNote: TFile | null
	): void {
		const row = body.createDiv({ cls: 'twobrain-home-contact' });
		if (entry.overdue) row.addClass('is-overdue');
		if (entry.loggedToday) row.addClass('is-logged');

		this.renderCheck(row, entry, dailyNote);

		const link = row.createEl('a', {
			cls: 'twobrain-home-contact-name',
			text: entry.name,
			href: entry.path,
		});
		link.setAttribute('title', this.checklist.hint(entry));
		link.addEventListener('click', evt => {
			evt.preventDefault();
			this.open(entry.path);
		});

		const age = row.createSpan({
			cls: 'twobrain-home-contact-age',
			text: this.checklist.age(entry.daysSinceSeen),
		});
		age.setAttribute('title', this.checklist.hint(entry));

		if (entry.owed > 0) {
			row.createSpan({ cls: 'twobrain-home-contact-tag is-owed', text: `owe ${entry.owed}` })
				.setAttribute('title', `${DIRECTION_LABEL.owed}: ${entry.owed}`);
		}
		if (entry.waiting > 0) {
			row.createSpan({
				cls: 'twobrain-home-contact-tag is-waiting',
				text: `wait ${entry.waiting}`,
			}).setAttribute('title', `${DIRECTION_LABEL.waiting}: ${entry.waiting}`);
		}

		this.renderStatusButtons(row, entry);
	}

	/**
	 * The check-off itself: one tap says "spoke to them today".
	 *
	 * It writes a bullet into today's daily note rather than a date onto the
	 * person's page, because the journal is the temporal truth (D1) and a
	 * person's page is a derived view whose `## Journal` section is rewritten
	 * on every open (D3). The line is a link, so the existing journal scan
	 * reads it back as contact and the whole vault agrees — no new store, and
	 * the same number shows up on the People dashboard.
	 */
	private renderCheck(
		row: HTMLElement, entry: ChecklistEntry, dailyNote: TFile | null
	): void {
		const box = row.createEl('input', { cls: 'twobrain-home-contact-check' });
		box.type = 'checkbox';
		box.checked = entry.loggedToday;
		box.setAttribute('aria-label', entry.loggedToday
			? `Undo today's contact with ${entry.name}`
			: `Log that you spoke to ${entry.name} today`);

		if (!dailyNote) {
			box.disabled = true;
			box.setAttribute('title', "No daily note for today yet — create it from the line above");
			return;
		}

		box.setAttribute('title', entry.loggedToday
			? `Logged in ${dailyNote.basename}. Uncheck to remove the line.`
			: `Add "Talked to ${entry.name}" to ${dailyNote.basename}`);
		box.addEventListener('change', () => {
			box.disabled = true;
			void this.logContact(entry, dailyNote, box.checked);
		});
	}

	/**
	 * Where a contact sits, changed in one tap.
	 *
	 * Buttons rather than a dropdown: a `<select>` on a phone opens a modal
	 * picker for a three-way choice, and only ever one of the three is a move
	 * you would make from this row anyway.
	 */
	private renderStatusButtons(row: HTMLElement, entry: ChecklistEntry): void {
		const actions = row.createDiv({ cls: 'twobrain-home-contact-actions' });

		const targets: ContactStatus[] = entry.status === 'active'
			? ['inactive', 'archived']
			: entry.status === 'inactive'
				? ['active', 'archived']
				: ['active'];

		for (const target of targets) this.statusButton(actions, entry, target);
	}

	/**
	 * A filing button, labelled with a word rather than an icon.
	 *
	 * An icon-only control explains itself through a hover tooltip, and a
	 * phone has no hover — so on the device where these are hardest to hit,
	 * "❙❙" would also have been unreadable. The words are short enough to fit
	 * beside a truncated name, and on desktop the whole group stays hidden
	 * until the row is hovered, so nothing is cluttered by the change.
	 */
	private statusButton(
		actions: HTMLElement, entry: ChecklistEntry, target: ContactStatus
	): void {
		const label = target === 'active' ? 'Activate'
			: target === 'inactive' ? 'Pause' : 'Archive';

		const button = actions.createEl('button', { cls: 'twobrain-home-contact-action' });
		button.addClass(`is-${target}`);
		button.setText(label);
		button.setAttribute('aria-label', `${label} ${entry.name}`);
		button.setAttribute('title', target === 'active'
			? `Move ${entry.name} back to active contacts`
			: target === 'inactive'
				? `Stop chasing ${entry.name} for now`
				: `File ${entry.name} away`);
		button.addEventListener('click', () => {
			button.disabled = true;
			void this.setStatus(entry, target);
		});
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
	): Promise<{ signals: { aging: number; quiet: number }; rows: PersonRow[] }> {
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
					archived: isArchivedPath(f.path),
					status: this.statusOf(f.path),
				}));

			const rows = this.people.buildRows({
				commitments: scan.commitments, contact: scan.contact, pages, today,
			});
			const summary = this.people.summarize(rows);
			return { signals: { aging: summary.aging, quiet: summary.quiet }, rows };
		} catch (e) {
			// Relationship signals are a bonus, not core to Home — a parse
			// failure here shouldn't take down the whole landing page.
			console.error('[2ndBrain] people signals failed:', e);
			return { signals: { aging: 0, quiet: 0 }, rows: [] };
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

	// ── Checklist actions ────────────────────────────────────────────────────

	/**
	 * Adds or removes the contact line in today's daily note.
	 *
	 * Appended at the very end. Today's note is either frozen — the daily
	 * pipeline returns early once `### Activities:` exists — or still
	 * generated, in which case that pipeline *prepends* its sections above
	 * whatever body is there. Either way a trailing line survives, which is
	 * why this is the one safe place to write from outside the pipeline.
	 *
	 * Unchecking only removes a line this checklist wrote. Someone can be
	 * "logged today" because you wrote about them properly, and silently
	 * deleting that sentence because a checkbox was clicked would be data loss.
	 */
	private async logContact(
		entry: ChecklistEntry, dailyNote: TFile, checked: boolean
	): Promise<void> {
		const line = this.checklist.contactLogLine(entry.name);
		let refused: string | null = null;

		try {
			// `vault.process` is an atomic read-modify-write. A plain read then
			// modify loses one of two contacts checked off in quick succession,
			// because both callbacks would have read the same note.
			await this.app.vault.process(dailyNote, content => {
				if (checked) return this.checklist.appendContactLog(content, line) ?? content;

				const lines = content.split('\n');
				const index = lines.indexOf(line);
				if (index === -1) {
					refused = `${entry.name} is named in today's note by something this checklist did not write — leaving it alone.`;
					return content;
				}

				lines.splice(index, 1);
				const next = lines.join('\n');
				// Blanking a note is never what a checkbox meant to do, and a
				// silently dropped write with the tick springing back is the
				// one outcome that looks like a broken button.
				if (next.trim() === '') {
					refused = `Removing that line would leave ${dailyNote.basename} empty. Edit it directly.`;
					return content;
				}
				return next;
			});

			if (refused !== null) new Notice(`2ndBrain: ${refused as string}`);
			await this.rerender();
		} catch (e) {
			new Notice(`2ndBrain: Could not log contact with ${entry.name} — ${(e as Error).message}`);
			console.error('[2ndBrain]', e);
			await this.rerender();
		}
	}

	/**
	 * Files a contact, and shows the move immediately.
	 *
	 * `processFrontMatter` writes the file, but the metadata cache the next
	 * render reads from is refreshed asynchronously — so re-rendering straight
	 * away can draw the row exactly where it was, and the button looks dead.
	 * The pending value is held until the cache catches up and agrees.
	 */
	private async setStatus(entry: ChecklistEntry, status: ContactStatus): Promise<void> {
		this.pending.set(entry.path, status);
		try {
			await setPersonStatus(this.app, entry.path, status);
		} catch (e) {
			this.pending.delete(entry.path);
			new Notice(`2ndBrain: Could not file ${entry.name} — ${(e as Error).message}`);
			console.error('[2ndBrain]', e);
		}
		await this.rerender();
	}

	/** The filed status, preferring a write the metadata cache has not caught up with. */
	private statusOf(path: string): ContactStatus {
		const actual = personStatus(this.app, path);
		const pending = this.pending.get(path);
		if (pending === undefined) return actual;
		if (pending === actual) {
			this.pending.delete(path);
			return actual;
		}
		return pending;
	}

	private async rerender(): Promise<void> {
		if (this.container) await this.render(this.container);
	}
}
