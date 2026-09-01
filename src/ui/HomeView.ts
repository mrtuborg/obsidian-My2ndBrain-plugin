import { App, TFile } from 'obsidian';
import { FileIO, AppLike } from '../utilities/FileIO';
import { loadActivityRecords } from '../utilities/ActivityIndex';
import { HomeDashboard, HomeSummary } from '../components/HomeDashboard';
import { contextsFolderForNote, contextPagePath, matchContextPagePath } from '../utilities/ContextPaths';
import { MatrixView, MatrixViewSettings } from './MatrixView';
import { ProjectsView, ProjectsViewSettings } from './ProjectsView';
import { ROLES } from '../roles';

export interface HomeViewSettings extends MatrixViewSettings, ProjectsViewSettings {}

/**
 * Live landing page rendered into a `2ndbrain-home` code block.
 *
 * Deliberately does not duplicate the matrix or dashboard logic — it embeds
 * the same MatrixView/ProjectsView instances used everywhere else, so this
 * page can never drift out of sync with what those notes show on their own.
 * What it adds on top is the stuff those two views don't cover: whether
 * today's note and Context pages exist yet, how much is sitting untriaged in
 * the Inbox, and a glance back at recent days.
 */
export class HomeView {
	private fileIO = new FileIO();
	private dashboard = new HomeDashboard();

	constructor(private app: App, private settings: HomeViewSettings) {}

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

		const journalFiles = allFiles
			.filter(f =>
				f.path.startsWith(this.settings.journalFolder + '/') &&
				!matchContextPagePath(f.path, this.settings.journalFolder, ROLES as readonly string[])
			)
			.map(f => ({ path: f.path, basename: f.basename }));

		const summary = this.dashboard.buildSummary(
			today,
			dailyNote?.path ?? null,
			roleContextPaths,
			activities.map(a => ({ project: a.project, stage: a.stage })),
			journalFiles
		);

		this.renderToday(container, summary);
		this.renderRoles(container, summary);
		this.renderInbox(container, summary);
		this.renderRecentJournal(container, summary);

		container.createEl('h3', { text: 'Take to work' });
		await new MatrixView(this.app, this.settings as MatrixViewSettings)
			.render(container.createDiv());

		container.createEl('h3', { text: 'Projects' });
		await new ProjectsView(this.app, this.settings as ProjectsViewSettings)
			.render(container.createDiv());
	}

	// ── Private ──────────────────────────────────────────────────────────────

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

	private renderToday(container: HTMLElement, summary: HomeSummary): void {
		const bar = container.createDiv({ cls: 'twobrain-home-today' });

		if (summary.dailyNotePath) {
			const link = bar.createEl('a', {
				text: `Today · ${summary.today}`,
				cls: 'twobrain-home-today-link',
				href: summary.dailyNotePath,
			});
			link.addClass('internal-link');
			link.addEventListener('click', evt => {
				evt.preventDefault();
				this.open(summary.dailyNotePath!);
			});
		} else {
			bar.createSpan({
				cls: 'twobrain-home-today-missing',
				text: `Today · ${summary.today} — no daily note yet`,
			});
		}
	}

	private renderRoles(container: HTMLElement, summary: HomeSummary): void {
		const row = container.createDiv({ cls: 'twobrain-home-roles' });
		for (const { role, path } of summary.roles) {
			if (path) {
				const link = row.createEl('a', {
					text: role,
					cls: 'twobrain-home-role-chip',
					href: path,
				});
				link.addClass('twobrain-home-role-ready');
				link.addClass('internal-link');
				link.addEventListener('click', evt => {
					evt.preventDefault();
					this.open(path);
				});
			} else {
				row.createSpan({
					cls: 'twobrain-home-role-chip',
					text: role,
				}).addClass('twobrain-home-role-pending');
			}
		}
	}

	private renderInbox(container: HTMLElement, summary: HomeSummary): void {
		if (summary.inboxCount === 0) return;
		const inboxPath = `${this.settings.projectsFolder}/Inbox.md`;

		const line = container.createDiv({ cls: 'twobrain-home-inbox' });
		const link = line.createEl('a', {
			text: `${summary.inboxCount} untriaged in Inbox`,
			cls: 'internal-link',
			href: inboxPath,
		});
		link.addEventListener('click', evt => {
			evt.preventDefault();
			this.open(inboxPath);
		});
	}

	private renderRecentJournal(container: HTMLElement, summary: HomeSummary): void {
		if (summary.recentJournal.length === 0) return;

		const section = container.createDiv({ cls: 'twobrain-home-recent' });
		section.createSpan({ cls: 'twobrain-home-recent-label', text: 'Recent' });
		for (const file of summary.recentJournal) {
			const link = section.createEl('a', {
				text: file.basename,
				cls: 'twobrain-home-recent-link',
				href: file.path,
			});
			link.addClass('internal-link');
			link.addEventListener('click', evt => {
				evt.preventDefault();
				this.open(file.path);
			});
		}
	}

	private open(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
	}
}
