import { App, Notice, TFile } from 'obsidian';
import { FileIO, AppLike } from '../utilities/FileIO';
import { loadActivityRecords } from '../utilities/ActivityIndex';
import { EisenhowerMatrix, MatrixActivity, MatrixQuadrant } from '../components/EisenhowerMatrix';
import { TAKE_TO_WORK_FIELD, TAKE_TO_WORK_DATE_FIELD } from '../utilities/TakeToWork';
import { PlanDateModal } from './PlanDateModal';

export interface MatrixViewSettings {
	activitiesFolder: string;
	archiveFolder: string;
}

/**
 * Live, clickable Eisenhower Matrix rendered into a `2ndbrain-matrix` code
 * block. Static generated markdown cannot carry buttons, so the matrix note
 * holds only the fenced block and this renderer produces the real DOM.
 *
 * Every button writes exactly one or two frontmatter lines on a single
 * activity file — deliberately the smallest possible write, so two devices
 * planning different activities never collide in Obsidian Sync.
 */
export class MatrixView {
	private fileIO = new FileIO();
	private matrix = new EisenhowerMatrix();
	private container: HTMLElement | null = null;

	constructor(private app: App, private settings: MatrixViewSettings) {}

	async render(container: HTMLElement): Promise<void> {
		this.container = container;
		container.empty();
		container.addClass('twobrain-matrix');

		const today = this.fileIO.todayDate();
		const activities = await loadActivityRecords(
			this.app as unknown as AppLike,
			this.settings.activitiesFolder,
			this.settings.archiveFolder
		);
		const quadrants = this.matrix.buildQuadrants(activities as MatrixActivity[], today);

		const total = quadrants.reduce((n, q) => n + q.activities.length, 0);
		const inWork = quadrants.reduce(
			(n, q) => n + q.activities.filter(a => a.takeToWork).length, 0
		);

		const summary = container.createDiv({ cls: 'twobrain-matrix-summary' });
		summary.setText(
			total === 0
				? 'No open activities found.'
				: `${inWork} of ${total} open activities taken to work today (${today}).`
		);

		for (const quadrant of quadrants) {
			this.renderQuadrant(container, quadrant);
		}
	}

	// ── Private ──────────────────────────────────────────────────────────────

	private renderQuadrant(container: HTMLElement, quadrant: MatrixQuadrant): void {
		container.createEl('h3', { text: quadrant.heading });

		if (quadrant.activities.length === 0) {
			container.createEl('p', { text: 'Nothing here.', cls: 'twobrain-matrix-empty' });
			return;
		}

		const table = container.createEl('table', { cls: 'twobrain-matrix-table' });
		const head = table.createEl('thead').createEl('tr');
		for (const label of ['', 'Activity', 'Planned', 'Role', 'Project', 'Stage', 'Actions']) {
			head.createEl('th', { text: label });
		}

		const body = table.createEl('tbody');
		for (const activity of quadrant.activities) {
			this.renderRow(body, activity);
		}
	}

	private renderRow(body: HTMLElement, activity: MatrixActivity): void {
		const row = body.createEl('tr');
		if (activity.takeToWork) row.addClass('twobrain-matrix-inwork');

		row.createEl('td', { text: activity.takeToWork ? '✅' : '', cls: 'twobrain-matrix-flag' });

		const nameCell = row.createEl('td');
		const link = nameCell.createEl('a', {
			text: activity.displayName,
			cls: 'internal-link',
			href: activity.path,
		});
		link.addEventListener('click', evt => {
			evt.preventDefault();
			const file = this.app.vault.getAbstractFileByPath(activity.path);
			if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
		});

		row.createEl('td', { text: activity.takeToWorkDate || '—' });
		row.createEl('td', { text: activity.role || '—' });
		row.createEl('td', { text: activity.project || '—' });
		row.createEl('td', { text: activity.stage || '—' });

		const actions = row.createEl('td', { cls: 'twobrain-matrix-actions' });

		const toggle = actions.createEl('button', {
			text: activity.takeToWork ? 'Drop' : 'Take to work',
		});
		toggle.setAttribute(
			'aria-label',
			activity.takeToWork
				? 'Remove from today\'s daily note'
				: 'Show in today\'s daily note and set stage to doing'
		);
		toggle.addEventListener('click', () => void this.toggleTakeToWork(activity));

		const plan = actions.createEl('button', { text: '📅' });
		plan.setAttribute('aria-label', 'Set a plan date (matrix only)');
		plan.addEventListener('click', () => void this.planDate(activity));

		const done = actions.createEl('button', { text: '✓' });
		done.setAttribute('aria-label', 'Mark done — removes it from the matrix');
		done.addEventListener('click', () => void this.markDone(activity));
	}

	/**
	 * Taking an activity to work also moves it to `stage: doing` — planning
	 * something for today and leaving it in the backlog is never what the
	 * user means. Dropping it only clears the flag; the stage stays as-is.
	 */
	private async toggleTakeToWork(activity: MatrixActivity): Promise<void> {
		const next = !activity.takeToWork;
		await this.applyFields(activity, next
			? { [TAKE_TO_WORK_FIELD]: 'true', stage: 'doing' }
			: { [TAKE_TO_WORK_FIELD]: 'false' }
		);
	}

	private async planDate(activity: MatrixActivity): Promise<void> {
		const chosen = await new PlanDateModal(
			this.app, activity.displayName, activity.takeToWorkDate
		).openAndGetValue();
		if (chosen === null) return;

		await this.applyFields(activity, {
			[TAKE_TO_WORK_DATE_FIELD]: chosen === '' ? null : chosen,
		});
	}

	private async markDone(activity: MatrixActivity): Promise<void> {
		await this.applyFields(activity, {
			stage: 'done',
			[TAKE_TO_WORK_FIELD]: 'false',
		});
	}

	private async applyFields(
		activity: MatrixActivity,
		fields: Record<string, string | null>
	): Promise<void> {
		try {
			await this.fileIO.updateFrontmatterFields(
				this.app as unknown as AppLike, activity.path, fields
			);
			if (this.container) await this.render(this.container);
		} catch (e) {
			new Notice(`2ndBrain: Could not update ${activity.displayName} — ${(e as Error).message}`);
			console.error('[2ndBrain]', e);
		}
	}
}
