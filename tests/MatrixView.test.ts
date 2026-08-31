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

const SETTINGS = { activitiesFolder: 'Activities', archiveFolder: 'Activities/Archive' };

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

	it('marking done retires the activity from the matrix and from planning', async () => {
		const { app, store } = makeApp({
			'Activities/planned.md': activityFile('p', ['stage: doing', 'takeToWork: true', 'priority: urgent-important']),
		});
		const root = new FakeEl('div');
		await new MatrixView(app, SETTINGS).render(root as unknown as HTMLElement);

		const done = buttonsFor(root, 'planned')[2]!;
		done.click();
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
});
