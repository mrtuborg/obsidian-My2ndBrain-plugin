import { App, Notice, TFile } from 'obsidian';
import { FileIO, AppLike } from '../utilities/FileIO';
import { scanCommitments, isPersonPage, CommitmentCache } from '../utilities/CommitmentIndex';
import {
	PeopleDashboard, PersonRow, CommitmentRow, PeopleSummary,
	PERSON_HEALTH_LABEL, PERSON_HEALTH_HINT, QUIET_DAYS,
} from '../components/PeopleDashboard';
import { PersonPage } from '../components/PeopleDashboard';
import { DIRECTION_LABEL, UNASSIGNED, Direction } from '../components/Commitments';
import { relativeAge } from './ProjectsView';

export interface PeopleViewSettings {
	journalFolder: string;
	peopleFolder: string;
	archiveFolder: string;
}

/** How the view reaches the cache the plugin persists between sessions. */
export interface CacheAccess {
	load(): CommitmentCache | null;
	save(cache: CommitmentCache): void;
}

type DirectionFilter = 'all' | Direction;

const COLUMN_WIDTHS = ['26%', '9%', '9%', '13%', '14%', '14%', '15%'];
const COLUMN_LABELS = ['Person', 'I owe', 'Waiting on', 'Oldest', 'Contact', 'Last seen', 'Status'];

/**
 * Live People dashboard rendered into a `2ndbrain-people` code block.
 *
 * The Projects view asks which project needs a decision; this asks the same
 * of people. Who is owed something, who owes me something, and who have I
 * quietly stopped talking to — the last of which nothing in the vault
 * surfaced before, because a relationship going cold produces no artifact.
 */
export class PeopleView {
	private fileIO = new FileIO();
	private dashboard = new PeopleDashboard();
	private container: HTMLElement | null = null;

	private direction: DirectionFilter = 'all';
	private person = '';
	private activity = '';
	private showKept = false;

	constructor(
		private app: App,
		private settings: PeopleViewSettings,
		private cache: CacheAccess
	) {}

	async render(container: HTMLElement): Promise<void> {
		this.container = container;
		container.empty();
		container.addClass('twobrain-people');

		const today = this.fileIO.todayDate();
		const app = this.app as unknown as AppLike;

		const scan = await scanCommitments(
			app, this.settings.journalFolder, this.settings.peopleFolder, this.cache.load()
		);
		if (scan.changed) this.cache.save(scan.cache);

		const rows = this.dashboard.buildRows({
			commitments: scan.commitments,
			contact: scan.contact,
			pages: this.personPages(),
			today,
		});
		const summary = this.dashboard.summarize(rows);

		this.renderSummary(container, today, summary, scan.scanned);

		// The syntax lesson earns a whole box only when there is nothing else
		// to look at. Once contact history fills the table, promises are a
		// feature the page is missing, not the reason it exists — so the
		// teaching shrinks to one line and gets out of the way.
		if (rows.length === 0) this.renderEmptyState(container);
		else if (summary.owed + summary.waiting === 0) this.renderSyntaxHint(container);

		this.renderFilters(container, rows);

		const visible = rows.filter(r => this.matches(r));

		// Three questions, in the order a review asks them: who is waiting on
		// something, who has gone quiet, and who am I actually in touch with.
		// Everyone else is an address book entry, and goes behind a fold.
		const outstanding = visible.filter(r => r.commitments.length > 0);
		const quiet = visible.filter(r => r.commitments.length === 0 && r.health === 'quiet');
		const active = visible.filter(r => r.commitments.length === 0 && r.health === 'active');
		const resting = visible.filter(r =>
			!outstanding.includes(r) && !quiet.includes(r) && !active.includes(r)
		);

		this.renderSection(container, outstanding, 'Outstanding',
			'Promises open in either direction');
		this.renderSection(container, quiet, 'Gone quiet',
			`No mention in the last ${QUIET_DAYS} days`);
		this.renderSection(container, active, 'In touch',
			`Mentioned in the last ${QUIET_DAYS} days`);

		this.renderMissingPages(container, rows);
		this.renderResting(container, resting);
	}

	/**
	 * One titled table, or nothing at all when the group is empty.
	 *
	 * Headed sections rather than one sorted table because the three groups
	 * answer different questions — a status pill in a long list makes you
	 * scan for the boundary the heading states outright.
	 */
	private renderSection(
		container: HTMLElement, rows: PersonRow[], title: string, hint: string
	): void {
		if (rows.length === 0) return;

		const head = container.createDiv({ cls: 'twobrain-people-section-head' });
		head.createSpan({ cls: 'twobrain-people-section-title', text: title });
		head.createSpan({ cls: 'twobrain-people-section-count', text: String(rows.length) });
		head.createSpan({ cls: 'twobrain-people-section-hint', text: hint });

		const table = this.renderTable(container);
		for (const row of rows) this.renderPerson(table, row);
	}

	// ── Data ─────────────────────────────────────────────────────────────────

	/**
	 * Every People page, archived ones included. An archived person is still
	 * a real person and a promise to them is still a promise; the dashboard
	 * just declines to nag about their silence.
	 */
	private personPages(): PersonPage[] {
		const pages: PersonPage[] = [];
		for (const file of this.app.vault.getFiles()) {
			if (!isPersonPage(file.path, this.settings.peopleFolder)) continue;
			pages.push({
				name: file.basename,
				path: file.path,
				archived: /\/Archive\//i.test(file.path),
			});
		}
		return pages;
	}

	private matches(row: PersonRow): boolean {
		if (this.person && row.name !== this.person) return false;
		if (this.direction === 'all' && !this.activity) return true;
		return row.commitments.some(c => this.matchesCommitment(c));
	}

	private matchesCommitment(c: CommitmentRow): boolean {
		if (this.direction !== 'all' && c.direction !== this.direction) return false;
		if (this.activity && c.activity !== this.activity) return false;
		if (c.done && !this.showKept) return false;
		return true;
	}

	// ── Chrome ───────────────────────────────────────────────────────────────

	private renderSummary(
		container: HTMLElement, today: string, s: PeopleSummary, scanned: number
	): void {
		const bar = container.createDiv({ cls: 'twobrain-people-summary' });

		// Lead with whatever carries signal. Before any promise is tagged
		// "0 promises are aging" is the largest number on the page and says
		// nothing; how many relationships are live always says something.
		const leadWithPromises = s.owed + s.waiting > 0;
		const count = leadWithPromises ? s.aging : s.active;
		const label = leadWithPromises
			? (s.aging === 1 ? 'promise is aging' : 'promises are aging')
			: (s.active === 1 ? 'person in touch' : 'people in touch');

		const main = bar.createDiv({ cls: 'twobrain-people-summary-main' });
		main.createSpan({ cls: 'twobrain-people-summary-count', text: String(count) });
		main.createSpan({ cls: 'twobrain-people-summary-label', text: label });

		bar.createSpan({ cls: 'twobrain-people-summary-date', text: today });

		const meta = bar.createDiv({ cls: 'twobrain-people-summary-meta' });
		if (leadWithPromises) {
			meta.createSpan({ text: `${s.owed} ${DIRECTION_LABEL.owed.toLowerCase()}` });
			meta.createSpan({ text: `${s.waiting} ${DIRECTION_LABEL.waiting.toLowerCase()}` });
		}
		meta.createSpan({ text: `${s.people} people` });
		if (s.quiet > 0) meta.createSpan({ text: `${s.quiet} gone quiet` });
		if (s.missingPages > 0) meta.createSpan({ text: `${s.missingPages} without a page` });
		meta.createSpan({
			cls: 'twobrain-people-scanned',
			text: `${scanned} journal notes`,
		});
	}

	/**
	 * There is nothing to backfill — the convention is new, so the dashboard
	 * is empty until it gets used. An empty state that only says "nothing
	 * here" would leave the user with no way to find that out.
	 */
	private renderEmptyState(container: HTMLElement): void {
		const box = container.createDiv({ cls: 'twobrain-people-empty' });
		box.createEl('p', {
			text: 'No promises tracked yet. Tag a todo in any daily note and it shows up here:',
		});
		const examples = box.createDiv({ cls: 'twobrain-people-examples' });
		for (const [line, hint] of [
			['- [ ] Send the BOM @owed [[Ida Haugland]]', DIRECTION_LABEL.owed],
			['- [ ] Radio spec @waiting [[Frederik Stray]]', DIRECTION_LABEL.waiting],
		]) {
			const row = examples.createDiv({ cls: 'twobrain-people-example' });
			row.createEl('code', { text: line });
			row.createSpan({ cls: 'twobrain-people-example-hint', text: hint! });
		}
		box.createEl('p', {
			cls: 'twobrain-people-empty-note',
			text: 'A promise under a heading that names someone is attributed to them too, '
				+ 'so you only have to write the name once.',
		});
	}

	/**
	 * The one-line form, for when the table already has contact history to
	 * show. Still names both tags — a hint nobody can act on is decoration.
	 */
	private renderSyntaxHint(container: HTMLElement): void {
		const hint = container.createDiv({ cls: 'twobrain-people-syntax-hint' });
		hint.createSpan({ text: 'No promises tracked yet — tag a todo with ' });
		hint.createEl('code', { text: '@owed' });
		hint.createSpan({ text: ' or ' });
		hint.createEl('code', { text: '@waiting' });
		hint.createSpan({ text: ' in a daily note and it shows up here.' });
	}

	private renderFilters(container: HTMLElement, rows: PersonRow[]): void {
		const bar = container.createDiv({ cls: 'twobrain-people-filters' });

		this.renderSelect(bar, 'Direction', this.direction, [
			{ value: 'all', label: 'Everything' },
			{ value: 'owed', label: DIRECTION_LABEL.owed },
			{ value: 'waiting', label: DIRECTION_LABEL.waiting },
		], value => { this.direction = value as DirectionFilter; });

		const people = rows
			.filter(r => r.commitments.length > 0)
			.map(r => r.name)
			.sort((a, b) => a.localeCompare(b));
		this.renderSelect(bar, 'Person', this.person, [
			{ value: '', label: 'Everyone' },
			...people.map(name => ({ value: name, label: name })),
		], value => { this.person = value; });

		const activities = [...new Set(
			rows.flatMap(r => r.commitments.map(c => c.activity)).filter(Boolean)
		)].sort((a, b) => a.localeCompare(b));
		if (activities.length > 0) {
			this.renderSelect(bar, 'Activity', this.activity, [
				{ value: '', label: 'Any activity' },
				...activities.map(name => ({ value: name, label: name })),
			], value => { this.activity = value; });
		}

		const toggle = bar.createEl('label', { cls: 'twobrain-people-toggle' });
		const box = toggle.createEl('input');
		box.type = 'checkbox';
		box.checked = this.showKept;
		toggle.createSpan({ text: 'Show kept' });
		box.addEventListener('change', () => {
			this.showKept = box.checked;
			void this.rerender();
		});
	}

	private renderSelect(
		bar: HTMLElement,
		label: string,
		current: string,
		options: Array<{ value: string; label: string }>,
		apply: (value: string) => void
	): void {
		const wrap = bar.createEl('label', { cls: 'twobrain-people-filter' });
		wrap.createSpan({ cls: 'twobrain-people-filter-label', text: label });
		const select = wrap.createEl('select', { cls: 'twobrain-people-select' });
		select.setAttribute('aria-label', label);
		for (const option of options) {
			const el = select.createEl('option', { text: option.label });
			el.value = option.value;
			if (option.value === current) el.selected = true;
		}
		select.addEventListener('change', () => {
			apply(select.value);
			void this.rerender();
		});
	}

	private renderTable(container: HTMLElement): HTMLElement {
		const table = container.createEl('table', { cls: 'twobrain-people-table' });
		const cols = table.createEl('colgroup');
		for (const width of COLUMN_WIDTHS) {
			cols.createEl('col').setAttribute('style', `width: ${width}`);
		}
		const head = table.createEl('thead').createEl('tr');
		for (const label of COLUMN_LABELS) head.createEl('th', { text: label });
		return table.createEl('tbody');
	}

	// ── Rows ─────────────────────────────────────────────────────────────────

	private renderPerson(body: HTMLElement, row: PersonRow): void {
		const tr = body.createEl('tr');
		tr.addClass(`twobrain-person-${row.health}`);

		this.renderName(tr, row);
		this.renderCount(tr, row.owed, 'twobrain-people-owed');
		this.renderCount(tr, row.waiting, 'twobrain-people-waiting');

		const oldest = tr.createEl('td', { cls: 'twobrain-people-age' });
		oldest.setText(row.open === 0 ? '·' : relativeAge(row.oldestOpen));
		if (row.open === 0) oldest.addClass('twobrain-people-zero');

		const days = tr.createEl('td', { cls: 'twobrain-people-num' });
		days.addClass('twobrain-people-contact');
		if (row.days === 0) {
			days.addClass('twobrain-people-zero');
			days.setText('·');
			days.setAttribute('title', 'Never mentioned in a daily note');
		} else {
			days.setText(row.days === 1 ? '1 day' : `${row.days} days`);
			days.setAttribute(
				'title',
				`Mentioned on ${row.days} journal ${row.days === 1 ? 'day' : 'days'}`
					+ (row.firstSeen ? `, first on ${row.firstSeen}` : '')
			);
		}

		const seen = tr.createEl('td', { cls: 'twobrain-people-age' });
		seen.setText(relativeAge(row.daysSinceSeen));
		seen.setAttribute('title', row.lastSeen || 'Never mentioned in the journal');

		const status = tr.createEl('td');
		const pill = status.createSpan({
			cls: 'twobrain-people-pill',
			text: PERSON_HEALTH_LABEL[row.health],
		});
		pill.addClass(`twobrain-pill-${row.health}`);
		pill.setAttribute('title', PERSON_HEALTH_HINT[row.health]);

		const shown = row.commitments.filter(c => this.matchesCommitment(c));
		if (shown.length > 0) this.renderCommitments(body, row, shown);
	}

	private renderName(tr: HTMLElement, row: PersonRow): void {
		const cell = tr.createEl('td', { cls: 'twobrain-people-name' });

		if (!row.path) {
			const span = cell.createSpan({ text: row.name });
			span.addClass(row.name === UNASSIGNED
				? 'twobrain-people-bucket'
				: 'twobrain-people-orphan');
			span.setAttribute('title', row.name === UNASSIGNED
				? 'Promises whose line named nobody'
				: `No page in ${this.settings.peopleFolder}/ for ${row.name}`);
			return;
		}

		const link = cell.createEl('a', { text: row.name, cls: 'internal-link', href: row.path });
		link.addEventListener('click', evt => {
			evt.preventDefault();
			this.open(row.path!);
		});
		if (row.archived) {
			cell.createSpan({ cls: 'twobrain-people-tag', text: 'archived' });
		}
	}

	private renderCount(tr: HTMLElement, value: number, cls: string): void {
		const cell = tr.createEl('td', { cls: 'twobrain-people-num' });
		if (value === 0) cell.addClass('twobrain-people-zero');
		else cell.addClass(cls);
		cell.setText(value === 0 ? '·' : String(value));
	}

	/** The promises themselves, in a full-width row beneath the person. */
	private renderCommitments(
		body: HTMLElement, row: PersonRow, shown: CommitmentRow[]
	): void {
		const tr = body.createEl('tr', { cls: 'twobrain-people-detail-row' });
		const cell = tr.createEl('td');
		cell.setAttribute('colspan', String(COLUMN_LABELS.length));
		const list = cell.createDiv({ cls: 'twobrain-people-commitments' });

		for (const c of shown) {
			const item = list.createDiv({ cls: 'twobrain-people-commitment' });
			if (c.done) item.addClass('is-done');
			if (c.aging) item.addClass('is-aging');

			const box = item.createEl('input', { cls: 'twobrain-people-check' });
			box.type = 'checkbox';
			box.checked = !!c.done;
			box.setAttribute('aria-label', c.done ? 'Reopen' : 'Mark kept');
			box.addEventListener('change', () => {
				box.disabled = true;
				void this.setDone(row, c, box.checked);
			});

			const tag = item.createSpan({ cls: 'twobrain-people-direction' });
			tag.addClass(`twobrain-dir-${c.direction}`);
			tag.setText(DIRECTION_LABEL[c.direction]);

			const text = item.createSpan({ cls: 'twobrain-people-commitment-text' });
			text.setText(c.text);

			if (c.activity) {
				item.createSpan({ cls: 'twobrain-people-activity', text: c.activity });
			}

			const age = item.createSpan({ cls: 'twobrain-people-commitment-age' });
			age.setText(c.done ? `kept ${c.done}` : relativeAge(c.age));
			age.setAttribute('title', c.done
				? `Opened ${c.born}, kept ${c.done}`
				: `Open since ${c.born}`);

			const jump = item.createEl('a', {
				cls: 'twobrain-people-jump',
				text: '↗',
				href: c.path,
			});
			jump.setAttribute('title', `Open ${c.path}`);
			jump.addEventListener('click', evt => {
				evt.preventDefault();
				this.open(c.path);
			});
		}
	}

	/**
	 * People the journal names but the vault has no page for — the real
	 * "bring People to the light" gap. No un-archiving is offered: the
	 * archive turned out to be correct, and second-guessing it by mention
	 * count would drag genuinely finished relationships back into view.
	 */
	private renderMissingPages(container: HTMLElement, rows: PersonRow[]): void {
		const missing = rows.filter(r => r.missingPage);
		if (missing.length === 0) return;

		const section = container.createDiv({ cls: 'twobrain-people-missing' });
		section.createEl('h4', { text: `${missing.length} mentioned with no page` });

		const chips = section.createDiv({ cls: 'twobrain-people-chips' });
		for (const row of missing) {
			const chip = chips.createEl('button', { cls: 'twobrain-people-chip' });
			chip.setText(row.name);
			chip.createSpan({ cls: 'twobrain-people-chip-plus', text: '+' });
			chip.setAttribute('title', `Create ${this.settings.peopleFolder}/${row.name}.md`);
			chip.addEventListener('click', () => {
				chip.disabled = true;
				void this.createPage(row.name);
			});
		}
	}

	/** Everyone with nothing outstanding, folded out of the way. */
	private renderResting(container: HTMLElement, resting: PersonRow[]): void {
		const named = resting.filter(r => r.name !== UNASSIGNED);
		if (named.length === 0) return;

		const details = container.createEl('details', { cls: 'twobrain-people-resting' });
		details.createEl('summary', { text: `${named.length} with nothing outstanding` });

		const chips = details.createDiv({ cls: 'twobrain-people-chips' });
		for (const row of named) {
			if (!row.path) {
				chips.createSpan({ cls: 'twobrain-people-chip', text: row.name });
				continue;
			}
			const chip = chips.createEl('a', {
				text: row.name,
				cls: 'twobrain-people-chip',
				href: row.path,
			});
			chip.addClass('internal-link');
			chip.addEventListener('click', evt => {
				evt.preventDefault();
				this.open(row.path!);
			});
		}
	}

	// ── Actions ──────────────────────────────────────────────────────────────

	private open(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
	}

	/**
	 * Flips the checkbox on the journal line itself.
	 *
	 * The journal is the source of truth (D1), so this is the same edit you
	 * would make by hand — but it is made blind, from a different note, which
	 * is why it matches the whole original line before touching anything. If
	 * the line has moved or been reworded since the scan, the write is
	 * abandoned rather than applied to whatever now sits at that position.
	 * Nothing is ever removed, only the checkbox character changes.
	 */
	private async setDone(row: PersonRow, c: CommitmentRow, done: boolean): Promise<void> {
		try {
			const app = this.app as unknown as AppLike;
			const content = await this.fileIO.loadFile(app, c.path);
			if (content === null) throw new Error(`${c.path} could not be read`);

			const lines = content.split('\n');
			const index = lines.indexOf(c.raw);
			if (index === -1) {
				new Notice(
					`2ndBrain: That line has changed in ${c.path} since this view loaded — reopening it instead.`
				);
				this.open(c.path);
				return;
			}

			const updated = done
				? lines[index]!.replace(/\[ \]/, '[x]')
				: lines[index]!.replace(/\[[xX]\]/, '[ ]');
			if (updated === lines[index]) return;

			lines[index] = updated;
			await this.fileIO.saveFile(app, c.path, lines.join('\n'));
			await this.rerender();
		} catch (e) {
			new Notice(`2ndBrain: Could not update ${row.name}'s promise — ${(e as Error).message}`);
			console.error('[2ndBrain]', e);
			await this.rerender();
		}
	}

	private async createPage(name: string): Promise<void> {
		const path = `${this.settings.peopleFolder}/${name}.md`;
		try {
			if (!this.app.vault.getAbstractFileByPath(this.settings.peopleFolder)) {
				await this.app.vault.createFolder(this.settings.peopleFolder);
			}
			if (!this.app.vault.getAbstractFileByPath(path)) {
				await this.app.vault.create(path, '');
			}
			await this.rerender();
		} catch (e) {
			new Notice(`2ndBrain: Could not create ${path} — ${(e as Error).message}`);
			console.error('[2ndBrain]', e);
		}
	}

	private async rerender(): Promise<void> {
		if (this.container) await this.render(this.container);
	}
}
