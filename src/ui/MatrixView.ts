import { App, Notice, TFile } from 'obsidian';
import { FileIO, AppLike } from '../utilities/FileIO';
import { loadActivityRecords } from '../utilities/ActivityIndex';
import { EisenhowerMatrix, MatrixActivity, MatrixQuadrant } from '../components/EisenhowerMatrix';
import { TAKE_TO_WORK_FIELD, TAKE_TO_WORK_DATE_FIELD } from '../utilities/TakeToWork';
import { PlanDateModal } from './PlanDateModal';
import {
	SelectOption,
	stageOptions,
	roleOptions,
	priorityOptions,
	projectOptions,
	collectProjectNames,
} from '../utilities/MatrixOptions';

export interface MatrixViewSettings {
	activitiesFolder: string;
	archiveFolder: string;
	projectsFolder: string;
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
	private projectNames: string[] = [];

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

		// Built once per render, not per row: every dropdown offers the same
		// vault-wide project list, and scanning the file list 50 times over
		// would be pure waste.
		this.projectNames = collectProjectNames(
			this.app.vault.getFiles().map(f => f.path),
			this.settings.projectsFolder,
			activities.map(a => a.project)
		);

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
		for (const label of ['', 'Activity', 'Planned', 'Role', 'Project', 'Priority', 'Stage', 'Actions']) {
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

		this.renderSelect(row, 'Role', roleOptions(activity.role), activity.role,
			value => this.applyFields(activity, { role: value || null }));

		this.renderSelect(row, 'Project', projectOptions(this.projectNames, activity.project),
			activity.project,
			value => this.applyFields(activity, { project: value || null }));

		this.renderSelect(row, 'Priority', priorityOptions(activity.priority), activity.priority,
			value => this.applyFields(activity, { priority: value || null }));

		this.renderSelect(row, 'Stage', stageOptions(activity.stage), activity.stage,
			value => this.changeStage(activity, value));

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
	}

	/**
	 * One dropdown cell. The option list always contains the activity's
	 * current value (see MatrixOptions), so rendering can never rewrite a
	 * field just by being displayed.
	 */
	private renderSelect(
		row: HTMLElement,
		label: string,
		options: SelectOption[],
		current: string,
		onChange: (value: string) => Promise<void>
	): void {
		const cell = row.createEl('td');
		const select = cell.createEl('select', { cls: 'twobrain-matrix-select' });
		select.setAttribute('aria-label', label);

		for (const option of options) {
			const el = select.createEl('option', { text: option.label });
			el.value = option.value;
			if (option.value === current) el.selected = true;
		}

		select.addEventListener('change', () => {
			const next = select.value;
			if (next === current) return;
			void onChange(next);
		});
	}

	/**
	 * Stage is now the only way to finish an activity — the old ✓ button did
	 * exactly this and nothing else, so a dropdown that already had to exist
	 * makes it redundant.
	 *
	 * `done` and `backlog` both mean "not what I'm doing today", so both clear
	 * the flag; leaving takeToWork set would keep a finished or shelved
	 * activity in tomorrow's daily note. Moving to `doing` leaves the flag
	 * alone: working on something and planning it for today are separate
	 * decisions, and the Take to work button owns the second one.
	 */
	private async changeStage(activity: MatrixActivity, stage: string): Promise<void> {
		const fields: Record<string, string | null> = { stage: stage || null };
		if (stage === 'done' || stage === 'backlog') fields[TAKE_TO_WORK_FIELD] = 'false';
		await this.applyFields(activity, fields);
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
