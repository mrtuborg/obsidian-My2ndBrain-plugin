import { MatrixView } from '../src/ui/MatrixView';

// ── Minimal stand-in for the Obsidian-augmented HTMLElement ──────────
// MatrixView only uses empty/addClass/setText/createEl/createDiv/
// setAttribute/addEventListener, so a tiny fake is enough to exercise the
// real rendering and button wiring without pulling in jsdom.

class FakeEl {
	children: FakeEl[] = [];
	classes = new Set<string>();
	attrs: Record<string, string> = {};
	text = '';
	value = '';
	type = '';
	selected = false;
	listeners: Record<string, Array<(evt: any) => void>> = {};

	constructor(public tag: string) {}

	empty() { this.children = []; this.text = ''; }
	addClass(c: string) { this.classes.add(c); }
	setText(t: string) { this.text = t; }
	setAttribute(k: string, v: string) { this.attrs[k] = v; }
	addEventListener(type: string, cb: (evt: any) => void) {
		(this.listeners[type] ??= []).push(cb);
	}
	createEl(tag: string, opts?: { text?: string; cls?: string; href?: string }) {
		const el = new FakeEl(tag);
		if (opts?.text) el.text = opts.text;
		if (opts?.cls) el.addClass(opts.cls);
		if (opts?.href) el.attrs['href'] = opts.href;
		this.children.push(el);
		return el as unknown as HTMLElement;
	}
	createDiv(opts?: { cls?: string }) { return this.createEl('div', opts); }

	/** Depth-first flatten, for assertions. */
	all(): FakeEl[] {
		return this.children.flatMap(c => [c, ...c.all()]);
	}
	find(tag: string): FakeEl[] {
		return this.all().filter(e => e.tag === tag);
	}
	click() { for (const cb of this.listeners['click'] ?? []) cb({ preventDefault() {} }); }

	/** Pick an option by value and fire 'change', like a real user would. */
	choose(value: string) {
		this.value = value;
		for (const cb of this.listeners['change'] ?? []) cb({ preventDefault() {} });
	}
	options(): string[] { return this.find('option').map(o => o.value); }
	/** Type into an input and fire 'change'. */
	fill(value: string) { this.choose(value); }
	selectedValue(): string {
		return this.find('option').find(o => o.selected)?.value ?? '';
	}
}

function activityFile(name: string, lines: string[]): string {
	return ['---', 'startDate: 2026-01-05', ...lines, 'responsible: [Me]', `project: ${name}`, '---', '', '## Description'].join('\n');
}

function makeApp(files: Record<string, string>) {
	const store = new Map(Object.entries(files));
	const saves: string[] = [];
	const app = {
		vault: {
			getAbstractFileByPath: (p: string) => (store.has(p) ? { path: p } : null),
			read: async (f: { path: string }) => store.get(f.path) ?? '',
			modify: async (f: { path: string }, c: string) => { store.set(f.path, c); saves.push(f.path); },
			getFiles: () => [...store.keys()].map(p => ({
				path: p,
				name: p.split('/').pop()!,
				basename: p.split('/').pop()!.replace(/\.md$/, ''),
			})),
			create: async () => undefined,
			createFolder: async () => undefined,
		},
		workspace: { getLeaf: () => ({ openFile: async () => undefined }) },
	} as any;
	return { app, store, saves };
}

const SETTINGS = {
	activitiesFolder: 'Activities',
	archiveFolder: 'Activities/Archive',
	projectsFolder: 'Projects',
	journalFolder: 'Journal',
};

const flush = () => new Promise(r => setTimeout(r, 0));

const TODAY = new Date().toISOString().slice(0, 10);
const DAILY_NOTE = `Journal/${TODAY}.md`;

function dailyNoteWith(blocks: string[]): string {
	return ['---', '---', '----', '', '<!-- 2ndbrain:activities-built -->', '----', ...blocks].join('\n');
}

/** The date input on the row for `displayName`. */
function dateFor(root: FakeEl, displayName: string): FakeEl {
	const row = root.find('tr').find(r => r.all().some(c => c.text === displayName));
	if (!row) throw new Error(`No row rendered for ${displayName}`);
	const input = row.find('input')[0];
	if (!input) throw new Error(`No date input on row ${displayName}`);
	return input;
}

/** The dropdown labelled `label` on the row for `displayName`. */
function selectFor(root: FakeEl, displayName: string, label: string): FakeEl {
	const row = root.find('tr').find(r => r.all().some(c => c.text === displayName));
	if (!row) throw new Error(`No row rendered for ${displayName}`);
	const sel = row.find('select').find(s => s.attrs['aria-label'] === label);
	if (!sel) throw new Error(`No ${label} dropdown on row ${displayName}`);
	return sel;
}

/** The row-level buttons, in render order: [toggle, plan, done]. */
function buttonsFor(root: FakeEl, displayName: string): FakeEl[] {
	const row = root.find('tr').find(r => r.all().some(c => c.text === displayName));
	if (!row) throw new Error(`No row rendered for ${displayName}`);
	return row.find('button');
}

describe('MatrixView', () => {
	it('renders a row per open activity, with a summary of what is taken to work', async () => {
		const { app } = makeApp({
			'Activities/planned.md': activityFile('p', ['stage: doing', 'takeToWork: true', 'priority: urgent-important']),
			'Activities/idle.md': activityFile('i', ['stage: backlog', 'takeToWork: false', 'priority: urgent-important']),
			'Activities/finished.md': activityFile('f', ['stage: done', 'takeToWork: false', 'priority: urgent-important']),
		});
		const root = new FakeEl('div');

		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		const names = root.find('a').map(a => a.text);
		expect(names).toContain('planned');
		expect(names).toContain('idle');
		expect(names).not.toContain('finished');

		const summary = root.find('div').find(d => d.classes.has('twobrain-matrix-summary'))!;
		expect(summary.text).toContain('1 of 2');
	});

	it('take to work sets the flag and moves a backlog activity to doing', async () => {
		const { app, store } = makeApp({
			'Activities/idle.md': activityFile('i', ['stage: backlog', 'takeToWork: false', 'priority: urgent-important']),
		});
		const root = new FakeEl('div');
		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		const [toggle] = buttonsFor(root, 'idle');
		expect(toggle!.text).toBe('Take to work');
		toggle!.click();
		await new Promise(r => setTimeout(r, 0));

		const saved = store.get('Activities/idle.md')!;
		expect(saved).toContain('takeToWork: true');
		expect(saved).toContain('stage: doing');
	});

	it('dropping an activity clears the flag but leaves its stage alone', async () => {
		const { app, store } = makeApp({
			'Activities/planned.md': activityFile('p', ['stage: doing', 'takeToWork: true', 'priority: urgent-important']),
		});
		const root = new FakeEl('div');
		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		const [toggle] = buttonsFor(root, 'planned');
		expect(toggle!.text).toBe('Drop');
		toggle!.click();
		await new Promise(r => setTimeout(r, 0));

		const saved = store.get('Activities/planned.md')!;
		expect(saved).toContain('takeToWork: false');
		expect(saved).toContain('stage: doing');
	});

	it('choosing done in the Stage column retires the activity, replacing the old ✓ button', async () => {
		const { app, store } = makeApp({
			'Activities/planned.md': activityFile('p', ['stage: doing', 'takeToWork: true', 'priority: urgent-important']),
		});
		const root = new FakeEl('div');
		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		expect(buttonsFor(root, 'planned').map(b => b.text)).toEqual(['Drop']);

		selectFor(root, 'planned', 'Stage').choose('done');
		await new Promise(r => setTimeout(r, 0));

		const saved = store.get('Activities/planned.md')!;
		expect(saved).toContain('stage: done');
		expect(saved).toContain('takeToWork: false');
		expect(root.find('a').map(a => a.text)).not.toContain('planned');
	});

	it('re-renders after an action so the view never shows stale state', async () => {
		const { app } = makeApp({
			'Activities/idle.md': activityFile('i', ['stage: backlog', 'takeToWork: false', 'priority: urgent-important']),
		});
		const root = new FakeEl('div');
		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		buttonsFor(root, 'idle')[0]!.click();
		await new Promise(r => setTimeout(r, 0));

		expect(buttonsFor(root, 'idle')[0]!.text).toBe('Drop');
		expect(root.find('a').filter(a => a.text === 'idle')).toHaveLength(1);
	});

	// ── Dropdown columns ─────────────────────────────────────────────────

	it('offers every stage, role and priority, with the current value preselected', async () => {
		const { app } = makeApp({
			'Activities/planned.md': activityFile('p', [
				'stage: doing', 'takeToWork: true', 'priority: urgent-important', 'role: Engineer',
			]),
		});
		const root = new FakeEl('div');
		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		const stage = selectFor(root, 'planned', 'Stage');
		expect(stage.options()).toEqual(['', 'doing', 'backlog', 'done']);
		expect(stage.selectedValue()).toBe('doing');

		const role = selectFor(root, 'planned', 'Role');
		expect(role.options()).toContain('Engineer');
		expect(role.options()).toContain('Family');
		expect(role.selectedValue()).toBe('Engineer');

		const priority = selectFor(root, 'planned', 'Priority');
		expect(priority.options()).toContain('not-urgent-important');
		expect(priority.selectedValue()).toBe('urgent-important');
	});

	it('changing priority moves the activity to another quadrant', async () => {
		const { app, store } = makeApp({
			'Activities/planned.md': activityFile('p', ['stage: doing', 'takeToWork: true', 'priority: urgent-important']),
		});
		const root = new FakeEl('div');
		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		selectFor(root, 'planned', 'Priority').choose('not-urgent-not-important');
		await new Promise(r => setTimeout(r, 0));

		expect(store.get('Activities/planned.md')!).toContain('priority: not-urgent-not-important');
		expect(selectFor(root, 'planned', 'Priority').selectedValue()).toBe('not-urgent-not-important');
	});

	it('assigning a role writes it, and clearing it removes the field', async () => {
		const { app, store } = makeApp({
			'Activities/planned.md': activityFile('p', ['stage: doing', 'takeToWork: true', 'priority: urgent-important', 'role: Engineer']),
		});
		const root = new FakeEl('div');
		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		selectFor(root, 'planned', 'Role').choose('Family');
		await new Promise(r => setTimeout(r, 0));
		expect(store.get('Activities/planned.md')!).toContain('role: Family');

		selectFor(root, 'planned', 'Role').choose('');
		await new Promise(r => setTimeout(r, 0));
		expect(store.get('Activities/planned.md')!).not.toContain('role:');
	});

	it('lists projects found in the vault and keeps the one already assigned', async () => {
		const { app, store } = makeApp({
			'Activities/planned.md': activityFile('p', ['stage: doing', 'takeToWork: true', 'priority: urgent-important']),
			'Projects/roommate/notes.md': '# roommate',
			'Projects/standalone.md': '# standalone',
		});
		// The helper writes `project: p`, a name no folder scan would find.
		const root = new FakeEl('div');
		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		const project = selectFor(root, 'planned', 'Project');
		expect(project.options()).toEqual(expect.arrayContaining(['roommate', 'standalone', 'p']));
		expect(project.selectedValue()).toBe('p');

		project.choose('roommate');
		await new Promise(r => setTimeout(r, 0));
		expect(store.get('Activities/planned.md')!).toContain('project: roommate');
	});

	it('shelving to backlog also drops it from today, so it cannot linger in tomorrow\'s note', async () => {
		const { app, store } = makeApp({
			'Activities/planned.md': activityFile('p', ['stage: doing', 'takeToWork: true', 'priority: urgent-important']),
		});
		const root = new FakeEl('div');
		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		selectFor(root, 'planned', 'Stage').choose('backlog');
		await new Promise(r => setTimeout(r, 0));

		const saved = store.get('Activities/planned.md')!;
		expect(saved).toContain('stage: backlog');
		expect(saved).toContain('takeToWork: false');
	});

	it('moving to doing leaves the take-to-work decision alone', async () => {
		const { app, store } = makeApp({
			'Activities/idle.md': activityFile('i', ['stage: backlog', 'takeToWork: false', 'priority: urgent-important']),
		});
		const root = new FakeEl('div');
		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		selectFor(root, 'idle', 'Stage').choose('doing');
		await new Promise(r => setTimeout(r, 0));

		const saved = store.get('Activities/idle.md')!;
		expect(saved).toContain('stage: doing');
		expect(saved).toContain('takeToWork: false');
	});

	// ── Planned date ─────────────────────────────────────────────────────

	it('edits the plan date inline rather than behind a modal', async () => {
		const { app, store } = makeApp({
			'Activities/planned.md': activityFile('p', ['stage: doing', 'takeToWork: true', 'priority: urgent-important']),
		});
		const root = new FakeEl('div');
		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		const date = dateFor(root, 'planned');
		expect(date.type).toBe('date');
		expect(date.value).toBe('');

		date.fill('2026-09-10');
		await new Promise(r => setTimeout(r, 0));

		expect(store.get('Activities/planned.md')!).toContain('takeToWorkDate: 2026-09-10');
		expect(dateFor(root, 'planned').value).toBe('2026-09-10');
	});

	it('clearing the plan date removes the field entirely', async () => {
		const { app, store } = makeApp({
			'Activities/planned.md': activityFile('p', [
				'stage: doing', 'takeToWork: true', 'priority: urgent-important',
				'takeToWorkDate: 2026-09-10',
			]),
		});
		const root = new FakeEl('div');
		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		expect(dateFor(root, 'planned').value).toBe('2026-09-10');

		dateFor(root, 'planned').fill('');
		await new Promise(r => setTimeout(r, 0));

		expect(store.get('Activities/planned.md')!).not.toContain('takeToWorkDate:');
	});

	it('a plan date never pulls an activity into the daily note by itself', async () => {
		// The date is sort/display metadata only — takeToWork stays the gate.
		const { app, store } = makeApp({
			'Activities/idle.md': activityFile('i', ['stage: backlog', 'takeToWork: false', 'priority: urgent-important']),
		});
		const root = new FakeEl('div');
		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		dateFor(root, 'idle').fill('2026-09-10');
		await new Promise(r => setTimeout(r, 0));

		expect(store.get('Activities/idle.md')!).toContain('takeToWork: false');
	});
	describe('a plan date that has come due', () => {
		it('takes the activity to work and consumes the date', async () => {
			const { app, store } = makeApp({
				'Activities/later.md': activityFile('l', [
					'stage: backlog', 'takeToWork: false',
					'priority: urgent-important', `takeToWorkDate: ${TODAY}`,
				]),
			});

			await new MatrixView(app, SETTINGS).render(new FakeEl('div') as unknown as HTMLElement);

			const written = store.get('Activities/later.md')!;
			expect(written).toContain('takeToWork: true');
			// Consumed, not kept: a lingering past date would re-take the
			// activity on every render and make dropping it impossible.
			expect(written).not.toContain('takeToWorkDate:');
		});

		it('leaves a future date alone', async () => {
			const { app, store } = makeApp({
				'Activities/later.md': activityFile('l', [
					'stage: backlog', 'takeToWork: false',
					'priority: urgent-important', 'takeToWorkDate: 2099-12-31',
				]),
			});

			await new MatrixView(app, SETTINGS).render(new FakeEl('div') as unknown as HTMLElement);

			const written = store.get('Activities/later.md')!;
			expect(written).toContain('takeToWork: false');
			expect(written).toContain('takeToWorkDate: 2099-12-31');
		});

		it('clears a stale date on a finished activity without reviving it', async () => {
			const { app, store } = makeApp({
				'Activities/finished.md': activityFile('f', [
					'stage: done', 'takeToWork: false',
					'priority: urgent-important', 'takeToWorkDate: 2020-01-01',
				]),
			});

			await new MatrixView(app, SETTINGS).render(new FakeEl('div') as unknown as HTMLElement);

			const written = store.get('Activities/finished.md')!;
			expect(written).not.toContain('takeToWorkDate:');
			expect(written).toContain('takeToWork: false');
		});
	});

	describe('dropping an activity', () => {
		it('removes its empty block from today\'s daily note', async () => {
			const { app, store } = makeApp({
				'Activities/planned.md': activityFile('p', [
					'stage: doing', 'takeToWork: true', 'priority: urgent-important',
				]),
				[DAILY_NOTE]: dailyNoteWith(['##### [[Activities/planned.md|planned]]', '----']),
			});
			const root = new FakeEl('div');
			await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

			buttonsFor(root, 'planned')[0]!.click();
			await flush();

			expect(store.get(DAILY_NOTE)!).not.toContain('Activities/planned.md');
			expect(store.get('Activities/planned.md')!).toContain('takeToWork: false');
		});

		// The note is the source of truth — a button never deletes the record.
		it('keeps a block that has notes under it', async () => {
			const { app, store } = makeApp({
				'Activities/planned.md': activityFile('p', [
					'stage: doing', 'takeToWork: true', 'priority: urgent-important',
				]),
				[DAILY_NOTE]: dailyNoteWith([
					'##### [[Activities/planned.md|planned]]',
					'- [ ] a real thing I noted',
					'----',
				]),
			});
			const root = new FakeEl('div');
			await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

			buttonsFor(root, 'planned')[0]!.click();
			await flush();

			expect(store.get(DAILY_NOTE)!).toContain('- [ ] a real thing I noted');
			expect(store.get('Activities/planned.md')!).toContain('takeToWork: false');
		});

		it('leaves other activities in the note untouched', async () => {
			const { app, store } = makeApp({
				'Activities/planned.md': activityFile('p', [
					'stage: doing', 'takeToWork: true', 'priority: urgent-important',
				]),
				[DAILY_NOTE]: dailyNoteWith([
					'##### [[Activities/planned.md|planned]]',
					'----',
					'##### [[Activities/other.md|other]]',
					'----',
				]),
			});
			const root = new FakeEl('div');
			await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

			buttonsFor(root, 'planned')[0]!.click();
			await flush();

			expect(store.get(DAILY_NOTE)!).toContain('Activities/other.md');
			expect(store.get(DAILY_NOTE)!).toContain('<!-- 2ndbrain:activities-built -->');
		});

		it('prunes the empty block when the stage is moved to done', async () => {
			const { app, store } = makeApp({
				'Activities/planned.md': activityFile('p', [
					'stage: doing', 'takeToWork: true', 'priority: urgent-important',
				]),
				[DAILY_NOTE]: dailyNoteWith(['##### [[Activities/planned.md|planned]]', '----']),
			});
			const root = new FakeEl('div');
			await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

			selectFor(root, 'planned', 'Stage').choose('done');
			await flush();

			expect(store.get(DAILY_NOTE)!).not.toContain('Activities/planned.md');
		});
	});
});
