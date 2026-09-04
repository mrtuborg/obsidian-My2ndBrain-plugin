import { App, Notice, TFile } from 'obsidian';
import { FileIO, AppLike } from '../utilities/FileIO';
import { loadActivityRecords } from '../utilities/ActivityIndex';
import { loadProjectRecords } from '../utilities/ProjectIndex';
import {
	ProjectsDashboard,
	ProjectDashboardRow,
	DashboardActivity,
	HEALTH_LABEL,
	HEALTH_HINT,
} from '../components/ProjectsDashboard';
import { roleOptions } from '../utilities/MatrixOptions';

export interface ProjectsViewSettings {
	activitiesFolder: string;
	archiveFolder: string;
	projectsFolder: string;
}

/** Column widths, so every role section lines up as one continuous table. */
const COLUMN_WIDTHS = ['24%', '18%', '6%', '8%', '6%', '12%', '14%', '12%'];
// "Activities", not "Progress": the bar shows the stage *mix*, so it always
// fills the track. Calling it progress would make an untouched project with
// one `doing` activity look finished.
const COLUMN_LABELS = [
	'Project', 'Activities', 'Doing', 'Backlog', 'Today', 'Last activity', 'Status', 'Role',
];

/**
 * Live Projects dashboard rendered into a `2ndbrain-projects` code block.
 *
 * The old static markdown answered "how many activities does each project
 * have", which in a real vault is a wall of `0/0 (0%)` rows. This view
 * answers the question a weekly review actually asks — *which projects need
 * a decision from me* — by leading with health, sorting by neglect, and
 * folding activity-less projects out of the way.
 */
export class ProjectsView {
	private fileIO = new FileIO();
	private dashboard = new ProjectsDashboard();
	private container: HTMLElement | null = null;

	constructor(private app: App, private settings: ProjectsViewSettings) {}

	async render(container: HTMLElement): Promise<void> {
		this.container = container;
		container.empty();
		container.addClass('twobrain-projects');

		const today = this.fileIO.todayDate();
		const app = this.app as unknown as AppLike;

		const activities: DashboardActivity[] = await loadActivityRecords(
			app, this.settings.activitiesFolder, this.settings.archiveFolder
		);
		const projects = await loadProjectRecords(app, this.settings.projectsFolder);
		const rows = this.dashboard.buildRows(activities, projects, today);

		this.renderSummary(container, today, rows);

		// Activity-less projects say nothing about the week; they'd otherwise
		// be the majority of the rows and drown the ones that matter.
		const live = rows.filter(r => r.health !== 'empty');
		const empty = rows.filter(r => r.health === 'empty');

		if (live.length === 0) {
			container.createEl('p', {
				text: 'No activities are attached to any project yet.',
				cls: 'twobrain-projects-empty',
			});
		}

		let currentRole: string | null = null;
		let table: HTMLElement | null = null;
		for (const row of live) {
			const roleHeading = row.role || 'No role';
			if (roleHeading !== currentRole) {
				currentRole = roleHeading;
				const count = live.filter(r => (r.role || 'No role') === roleHeading).length;
				table = this.renderSection(container, roleHeading, count);
			}
			this.renderRow(table!, row);
		}

		this.renderDormant(container, empty);
	}

	// ── Private ──────────────────────────────────────────────────────────────

	/** Headline: how many projects are asking for a decision right now. */
	private renderSummary(
		container: HTMLElement, today: string, rows: ProjectDashboardRow[]
	): void {
		const attention = rows.filter(
			r => r.health === 'stalled' || r.health === 'no-next-action'
		).length;
		const tracked = rows.filter(r => r.health !== 'empty').length;
		const done = rows.reduce((n, r) => n + r.done, 0);
		const total = rows.reduce((n, r) => n + r.total, 0);
		const takenToday = rows.reduce((n, r) => n + r.takenToday, 0);

		const bar = container.createDiv({ cls: 'twobrain-projects-summary' });

		const main = bar.createDiv({ cls: 'twobrain-projects-summary-main' });
		main.createSpan({ cls: 'twobrain-projects-summary-count', text: String(attention) });
		main.createSpan({
			cls: 'twobrain-projects-summary-label',
			text: tracked === 0
				? 'No projects with activities'
				: attention === 1
					? `project needs a decision, of ${tracked} tracked`
					: `projects need a decision, of ${tracked} tracked`,
		});

		bar.createSpan({ cls: 'twobrain-projects-summary-date', text: today });

		const meta = bar.createDiv({ cls: 'twobrain-projects-summary-meta' });
		meta.createSpan({ text: `${done}/${total} activities done` });
		meta.createSpan({ text: `${takenToday} taken to work today` });

		// The stacked bars are only readable once, so the key lives here
		// rather than as a tooltip the user has to go hunting for.
		const legend = meta.createSpan({ cls: 'twobrain-projects-legend' });
		for (const stage of ['done', 'doing', 'backlog'] as const) {
			const item = legend.createSpan({ cls: 'twobrain-projects-legend-item' });
			item.createSpan({ cls: `twobrain-projects-swatch twobrain-seg-${stage}` });
			item.createSpan({ text: stage });
		}

		const rail = bar.createDiv({ cls: 'twobrain-projects-progress' });
		const fill = rail.createDiv({ cls: 'twobrain-projects-progress-fill' });
		fill.setAttribute('style', `width: ${total === 0 ? 0 : Math.round((done / total) * 100)}%`);
	}

	/** A role heading plus the table body rows will be appended to. */
	private renderSection(container: HTMLElement, role: string, count: number): HTMLElement {
		const section = container.createDiv({ cls: 'twobrain-projects-section' });

		const header = section.createDiv({ cls: 'twobrain-projects-section-header' });
		header.createSpan({ cls: 'twobrain-projects-section-title', text: role });
		header.createSpan({ cls: 'twobrain-projects-section-count', text: String(count) });

		const table = section.createEl('table', { cls: 'twobrain-projects-table' });
		const cols = table.createEl('colgroup');
		for (const width of COLUMN_WIDTHS) {
			cols.createEl('col').setAttribute('style', `width: ${width}`);
		}

		const head = table.createEl('thead').createEl('tr');
		for (const label of COLUMN_LABELS) head.createEl('th', { text: label });

		return table.createEl('tbody');
	}

	private renderRow(body: HTMLElement, row: ProjectDashboardRow): void {
		const tr = body.createEl('tr');
		tr.addClass(`twobrain-health-${row.health}`);

		this.renderName(tr, row);
		this.renderProgress(tr, row);

		this.renderNumber(tr, row.doing);
		this.renderNumber(tr, row.backlog);
		this.renderNumber(tr, row.takenToday, 'twobrain-projects-today');

		const touched = tr.createEl('td', { cls: 'twobrain-projects-age' });
		touched.setText(relativeAge(row.daysSinceActivity));
		touched.setAttribute('title', row.latestDate || 'No activity has a start date');

		const status = tr.createEl('td');
		const pill = status.createSpan({
			cls: 'twobrain-projects-pill',
			text: HEALTH_LABEL[row.health],
		});
		pill.addClass(`twobrain-pill-${row.health}`);
		pill.setAttribute('title', HEALTH_HINT[row.health]);

		this.renderRoleSelect(tr, row);
	}

	private renderName(tr: HTMLElement, row: ProjectDashboardRow): void {
		const cell = tr.createEl('td', { cls: 'twobrain-projects-name' });
		if (!row.path) {
			// No project file matched this `project:` value — likely a typo or
			// a project that was never created. Say so rather than link nowhere.
			const span = cell.createSpan({ text: row.slug, cls: 'twobrain-projects-orphan' });
			span.setAttribute('title', `No file in ${this.settings.projectsFolder}/ matches "${row.slug}"`);
			return;
		}

		const link = cell.createEl('a', {
			text: row.slug,
			cls: 'internal-link',
			href: row.path,
		});
		link.setAttribute('title', row.slug);
		link.addEventListener('click', evt => {
			evt.preventDefault();
			const file = this.app.vault.getAbstractFileByPath(row.path!);
			if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
		});
	}

	/**
	 * One stacked bar per project: done / doing / backlog, in that order.
	 * A single percentage hides the difference between "nothing started" and
	 * "everything started and nothing finished", which is the distinction a
	 * review cares about most.
	 */
	private renderProgress(tr: HTMLElement, row: ProjectDashboardRow): void {
		const cell = tr.createEl('td', { cls: 'twobrain-projects-progress-cell' });
		// A flex <td> stops behaving like a table cell (row height and cell
		// borders stop lining up), so the flex row lives in a wrapper.
		const wrap = cell.createDiv({ cls: 'twobrain-projects-barwrap' });

		const bar = wrap.createDiv({ cls: 'twobrain-projects-bar' });
		bar.setAttribute(
			'title',
			`${row.done} done · ${row.doing} doing · ${row.backlog} backlog · ${row.total} total`
		);
		for (const [stage, count] of [['done', row.done], ['doing', row.doing], ['backlog', row.backlog]] as const) {
			if (count === 0) continue;
			const seg = bar.createDiv({ cls: 'twobrain-projects-bar-seg' });
			seg.addClass(`twobrain-seg-${stage}`);
			seg.setAttribute('style', `width: ${(count / row.total) * 100}%`);
		}

		wrap.createSpan({
			cls: 'twobrain-projects-bar-label',
			text: `${row.done}/${row.total}`,
		});
	}

	/** A count cell. Zero reads as absent, so it can't compete with real numbers. */
	private renderNumber(tr: HTMLElement, value: number, cls = ''): void {
		const cell = tr.createEl('td', { cls: 'twobrain-projects-num' });
		if (value === 0) {
			cell.addClass('twobrain-projects-zero');
		} else if (cls) {
			cell.addClass(cls);
		}
		cell.setText(value === 0 ? '·' : String(value));
	}

	/**
	 * Role is editable here because this view is grouped by it: a project
	 * sitting under "No role" is a visible defect the user can fix in place
	 * instead of opening the project file to edit one frontmatter line.
	 */
	private renderRoleSelect(tr: HTMLElement, row: ProjectDashboardRow): void {
		const cell = tr.createEl('td');
		if (!row.path) {
			// The role of a pathless row is inferred from its activities and
			// there is no file to write it to.
			cell.createSpan({ cls: 'twobrain-projects-zero', text: '·' });
			return;
		}

		const select = cell.createEl('select', { cls: 'twobrain-projects-select' });
		select.setAttribute('aria-label', 'Role');
		for (const option of roleOptions(row.role)) {
			const el = select.createEl('option', { text: option.label });
			el.value = option.value;
			if (option.value === row.role) el.selected = true;
		}

		select.addEventListener('change', () => {
			const next = select.value;
			if (next === row.role) return;
			void this.setRole(row, next);
		});
	}

	private async setRole(row: ProjectDashboardRow, role: string): Promise<void> {
		try {
			await this.fileIO.updateFrontmatterFields(
				this.app as unknown as AppLike, row.path!, { role: role || null }
			);
			if (this.container) await this.render(this.container);
		} catch (e) {
			new Notice(`2ndBrain: Could not update ${row.slug} — ${(e as Error).message}`);
			console.error('[2ndBrain]', e);
		}
	}

	/** Projects nothing points at, collapsed into one foldable line. */
	private renderDormant(container: HTMLElement, empty: ProjectDashboardRow[]): void {
		if (empty.length === 0) return;

		const details = container.createEl('details', { cls: 'twobrain-projects-dormant' });
		details.createEl('summary', { text: `${empty.length} projects with no activities` });

		const list = details.createDiv({ cls: 'twobrain-projects-chips' });
		for (const row of empty) {
			if (!row.path) {
				list.createSpan({ cls: 'twobrain-projects-chip', text: row.slug });
				continue;
			}
			const chip = list.createEl('a', {
				text: row.slug,
				cls: 'twobrain-projects-chip',
				href: row.path,
			});
			chip.addClass('internal-link');
			chip.addEventListener('click', evt => {
				evt.preventDefault();
				const file = this.app.vault.getAbstractFileByPath(row.path!);
				if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
			});
		}
	}

	/**
	 * A "project" is either a top-level Projects/<slug>.md file, or a
	 * Projects/<slug>/Project.md inside a project subfolder — mirrors the
	 * two shapes already used across the vault.
	 */
}

/**
 * "2mo" beats "2026-07-14": the review wants to know how long something has
 * been sitting, and a raw date makes the reader do the subtraction.
 */
export function relativeAge(days: number | null): string {
	if (days === null) return '—';
	if (days <= 0) return 'today';
	if (days === 1) return 'yesterday';
	if (days < 7) return `${days}d`;
	if (days < 60) return `${Math.round(days / 7)}w`;
	if (days < 365) return `${Math.round(days / 30)}mo`;
	return `${Math.floor(days / 365)}y`;
}
