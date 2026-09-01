import { ProjectsView, relativeAge } from '../src/ui/ProjectsView';

// ── Minimal stand-in for the Obsidian-augmented HTMLElement ──────────
// Same approach as tests/MatrixView.test.ts: ProjectsView only touches
// empty/addClass/setText/createEl/createDiv/createSpan/setAttribute/
// addEventListener, so a tiny fake exercises the real rendering without
// pulling in jsdom.

class FakeEl {
	children: FakeEl[] = [];
	classes = new Set<string>();
	attrs: Record<string, string> = {};
	text = '';
	value = '';
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
	createSpan(opts?: { cls?: string; text?: string }) { return this.createEl('span', opts); }

	all(): FakeEl[] { return this.children.flatMap(c => [c, ...c.all()]); }
	find(tag: string): FakeEl[] { return this.all().filter(e => e.tag === tag); }
	withClass(c: string): FakeEl[] { return this.all().filter(e => e.classes.has(c)); }

	choose(value: string) {
		this.value = value;
		for (const cb of this.listeners['change'] ?? []) cb({ preventDefault() {} });
	}
}

/** Click handlers are fire-and-forget, so let their promises settle. */
const flush = () => new Promise(r => setTimeout(r, 0));

const TODAY = new Date().toISOString().slice(0, 10);

function daysAgo(n: number): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - n);
	return d.toISOString().slice(0, 10);
}

function activityFile(project: string, stage: string, startDate: string, extra: string[] = []): string {
	return [
		'---',
		`startDate: ${startDate}`,
		`stage: ${stage}`,
		'responsible: [Me]',
		`project: ${project}`,
		...extra,
		'---',
		'',
		'## Description',
	].join('\n');
}

function makeApp(files: Record<string, string>) {
	const store = new Map(Object.entries(files));
	const app = {
		vault: {
			getAbstractFileByPath: (p: string) => (store.has(p) ? { path: p } : null),
			read: async (f: { path: string }) => store.get(f.path) ?? '',
			modify: async (f: { path: string }, c: string) => { store.set(f.path, c); },
			getFiles: () => [...store.keys()].map(p => ({
				path: p,
				name: p.split('/').pop()!,
				basename: p.split('/').pop()!.replace(/\.md$/, ''),
			})),
			create: async () => undefined,
			createFolder: async () => undefined,
		},
		workspace: { getLeaf: () => ({ openFile: async () => undefined }) },
	};
	return { app, store };
}

const SETTINGS = {
	activitiesFolder: 'Activities',
	archiveFolder: 'Activities/Archive',
	projectsFolder: 'Projects',
};

async function renderWith(files: Record<string, string>) {
	const { app, store } = makeApp(files);
	const view = new ProjectsView(app as any, SETTINGS);
	const root = new FakeEl('div');
	await view.render(root as unknown as HTMLElement);
	return { root, store, view };
}

describe('ProjectsView', () => {
	it('leads with how many projects need a decision', async () => {
		const { root } = await renderWith({
			// Stalled: open work, nothing dated recently.
			'Activities/a1.md': activityFile('old', 'doing', daysAgo(200)),
			// No next action: open work, nothing in progress.
			'Activities/a2.md': activityFile('shelved', 'backlog', daysAgo(3)),
			// Healthy, needs nothing.
			'Activities/a3.md': activityFile('humming', 'doing', daysAgo(2)),
			'Projects/old.md': '---\nrole: Engineer\n---\n',
			'Projects/shelved.md': '---\nrole: Engineer\n---\n',
			'Projects/humming.md': '---\nrole: Engineer\n---\n',
		});

		const count = root.withClass('twobrain-projects-summary-count')[0]!;
		const label = root.withClass('twobrain-projects-summary-label')[0]!;
		expect(count.text).toBe('2');
		expect(label.text).toBe('projects need a decision, of 3 tracked');
		expect(root.withClass('twobrain-projects-summary-date')[0]!.text).toBe(TODAY);
	});

	it('uses the singular when exactly one project needs a decision', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('shelved', 'backlog', daysAgo(3)),
			'Projects/shelved.md': '---\nrole: Engineer\n---\n',
		});
		expect(root.withClass('twobrain-projects-summary-label')[0]!.text)
			.toBe('project needs a decision, of 1 tracked');
	});

	it('tags each row with its health so the stalled ones are findable', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('old', 'doing', daysAgo(200)),
			'Projects/old.md': '---\nrole: Engineer\n---\n',
		});

		expect(root.find('tr').some(r => r.classes.has('twobrain-health-stalled'))).toBe(true);
		const pill = root.withClass('twobrain-projects-pill')[0]!;
		expect(pill.text).toBe('Stalled');
		expect(pill.classes.has('twobrain-pill-stalled')).toBe(true);
	});

	it('draws one bar segment per non-empty stage, sized by share of the total', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('p', 'done', daysAgo(1)),
			'Activities/a2.md': activityFile('p', 'doing', daysAgo(1)),
			'Activities/a3.md': activityFile('p', 'doing', daysAgo(1)),
			'Activities/a4.md': activityFile('p', 'backlog', daysAgo(1)),
			'Projects/p.md': '---\nrole: Engineer\n---\n',
		});

		const segs = root.withClass('twobrain-projects-bar-seg');
		expect(segs).toHaveLength(3);
		expect(segs[0]!.attrs['style']).toBe('width: 25%');
		expect(segs[1]!.attrs['style']).toBe('width: 50%');
		expect(segs[2]!.attrs['style']).toBe('width: 25%');
		expect(root.withClass('twobrain-projects-bar-label')[0]!.text).toBe('1/4');
	});

	it('omits a segment for a stage with nothing in it', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('p', 'doing', daysAgo(1)),
			'Projects/p.md': '---\nrole: Engineer\n---\n',
		});
		const segs = root.withClass('twobrain-projects-bar-seg');
		expect(segs).toHaveLength(1);
		expect(segs[0]!.classes.has('twobrain-seg-doing')).toBe(true);
	});

	it('accents how many of a project\'s activities are planned for today', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('p', 'doing', daysAgo(1), ['takeToWork: true']),
			'Activities/a2.md': activityFile('p', 'doing', daysAgo(1), ['takeToWork: false']),
			'Projects/p.md': '---\nrole: Engineer\n---\n',
		});
		const today = root.withClass('twobrain-projects-today')[0]!;
		expect(today.text).toBe('1');
	});

	it('folds activity-less projects into a collapsed section instead of listing them as rows', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('real', 'doing', daysAgo(1)),
			'Projects/real.md': '---\nrole: Engineer\n---\n',
			'Projects/ghost-a.md': '---\nrole: Engineer\n---\n',
			'Projects/ghost-b.md': '---\nrole: Family\n---\n',
		});

		const details = root.find('details')[0]!;
		expect(details.find('summary')[0]!.text).toBe('2 projects with no activities');
		expect(root.withClass('twobrain-projects-chip').map(c => c.text).sort())
			.toEqual(['ghost-a', 'ghost-b']);

		// One role section only — Family exists solely as a ghost.
		expect(root.withClass('twobrain-projects-section-title').map(t => t.text))
			.toEqual(['Engineer']);
	});

	it('omits the dormant section entirely when every project has activities', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('real', 'doing', daysAgo(1)),
			'Projects/real.md': '---\nrole: Engineer\n---\n',
		});
		expect(root.find('details')).toHaveLength(0);
	});

	it('writes the picked role back to the project file', async () => {
		const { root, store } = await renderWith({
			'Activities/a1.md': activityFile('p', 'doing', daysAgo(1)),
			'Projects/p.md': '---\nstage: doing\n---\n',
		});

		const select = root.withClass('twobrain-projects-select')[0]!;
		select.choose('Family');
		await flush();

		expect(store.get('Projects/p.md')).toContain('role: Family');
	});

	it('offers no role picker for a project value that has no file behind it', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('typoed', 'doing', daysAgo(1)),
		});

		expect(root.withClass('twobrain-projects-select')).toHaveLength(0);
		const orphan = root.withClass('twobrain-projects-orphan')[0]!;
		expect(orphan.text).toBe('typoed');
		expect(orphan.attrs['title']).toContain('No file in Projects/');
	});

	it('says so plainly when no activity is attached to any project', async () => {
		const { root } = await renderWith({ 'Projects/ghost.md': '---\n---\n' });
		expect(root.withClass('twobrain-projects-empty')[0]!.text)
			.toBe('No activities are attached to any project yet.');
	});
});

describe('relativeAge', () => {
	it('reads as an elapsed gap rather than a date', () => {
		expect(relativeAge(null)).toBe('—');
		expect(relativeAge(0)).toBe('today');
		expect(relativeAge(1)).toBe('yesterday');
		expect(relativeAge(4)).toBe('4d');
		expect(relativeAge(21)).toBe('3w');
		expect(relativeAge(90)).toBe('3mo');
		expect(relativeAge(400)).toBe('1y');
	});
});
