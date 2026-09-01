import { HomeView } from '../src/ui/HomeView';
import { TFile } from 'obsidian';

// Same fake as tests/ProjectsView.test.ts / tests/MatrixView.test.ts.
// NOTE: createEl treats `cls` as one class string, so multi-class elements
// must be built with a follow-up addClass — HomeView does exactly that.
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
	createDiv(opts?: { cls?: string; text?: string }) { return this.createEl('div', opts); }
	createSpan(opts?: { cls?: string; text?: string }) { return this.createEl('span', opts); }
	// Obsidian puts createSvg on Node, so it works the same on both.
	createSvg(tag: string, opts?: { cls?: string }) { return this.createEl(tag, opts); }
	get textContent() { return this.text; }
	set textContent(v: string) { this.text = v; }

	all(): FakeEl[] { return this.children.flatMap(c => [c, ...c.all()]); }
	find(tag: string): FakeEl[] { return this.all().filter(e => e.tag === tag); }
	withClass(c: string): FakeEl[] { return this.all().filter(e => e.classes.has(c)); }
	one(c: string): FakeEl | undefined { return this.withClass(c)[0]; }
	click(c: string) {
		for (const cb of this.one(c)?.listeners['click'] ?? []) cb({ preventDefault() {} });
	}
}

const TODAY = new Date().toISOString().slice(0, 10);

function daysAgo(n: number): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - n);
	return d.toISOString().slice(0, 10);
}

function activityFile(
	role: string, project: string, stage: string, takeToWork: boolean, startDate = daysAgo(1)
): string {
	return [
		'---',
		`startDate: ${startDate}`,
		`stage: ${stage}`,
		'responsible: [Me]',
		`project: ${project}`,
		`role: ${role}`,
		`takeToWork: ${takeToWork}`,
		'---',
		'',
		'## Description',
	].join('\n');
}

const SETTINGS = {
	activitiesFolder: 'Activities',
	archiveFolder: 'Activities/Archive',
	projectsFolder: 'Projects',
	journalFolder: 'Journal',
	dashboardsFolder: 'Dashboards',
	peopleFolder: 'People',
};

function makeApp(files: Record<string, string>) {
	const store = new Map(Object.entries(files));
	const opened: string[] = [];
	// Real TFile instances: HomeView.open() guards on `instanceof TFile` so it
	// never tries to open a folder, and a plain object would slip past the test.
	const handle = (p: string) => Object.assign(new TFile(), {
		path: p,
		name: p.split('/').pop()!,
		basename: p.split('/').pop()!.replace(/\.md$/, ''),
		// The consistency grid reads size straight off the vault index.
		stat: { size: (store.get(p) ?? '').length, ctime: 0, mtime: 0 },
	});
	const app = {
		vault: {
			getAbstractFileByPath: (p: string) => (store.has(p) ? handle(p) : null),
			read: async (f: { path: string }) => store.get(f.path) ?? '',
			modify: async (f: { path: string }, c: string) => { store.set(f.path, c); },
			getFiles: () => [...store.keys()].map(handle),
		},
		workspace: {
			getLeaf: () => ({
				openFile: async (f: { path: string }) => { opened.push(f.path); },
			}),
		},
	};
	return { app, opened };
}

function makeCacheStore() {
	let cache: any = null;
	return { load: () => cache, save: (c: any) => { cache = c; } };
}

async function renderWith(files: Record<string, string>) {
	const { app, opened } = makeApp(files);
	const root = new FakeEl('div');
	await new HomeView(app as any, SETTINGS, makeCacheStore()).render(root as unknown as HTMLElement);
	return { root, opened };
}

describe('HomeView banner', () => {
	it('leads with how many activities are taken to work today', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('Engineer', 'p', 'doing', true),
			'Activities/a2.md': activityFile('Engineer', 'p', 'backlog', false),
			'Projects/p.md': '---\nrole: Engineer\n---\n',
		});
		expect(root.one('twobrain-home-bignum')!.text).toBe('1');
		expect(root.one('twobrain-home-bignum-label')!.text).toBe('taken to work · 2 open');
	});

	it('shows a greeting and a human-readable date', async () => {
		const { root } = await renderWith({});
		expect(root.one('twobrain-home-greeting')!.text).toMatch(/^(Good|Still)/);
		expect(root.one('twobrain-home-date')!.text).toMatch(/^[A-Z][a-z]+day, \d+ [A-Z][a-z]+$/);
	});
});

describe('HomeView roles', () => {
	it('renders one card per role with its taken/open ratio', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('Engineer', 'p', 'doing', true),
			'Activities/a2.md': activityFile('Engineer', 'p', 'backlog', false),
			'Projects/p.md': '---\nrole: Engineer\n---\n',
		});
		const cards = root.withClass('twobrain-home-role');
		expect(cards).toHaveLength(5);
		const engineer = cards.find(c =>
			c.all().some(x => x.classes.has('twobrain-home-role-name') && x.text === 'Engineer'))!;
		expect(engineer.all().find(x => x.classes.has('twobrain-home-role-count'))!.text)
			.toBe('1 / 2');
	});

	it('marks a role untouched when it has open work but nothing planned', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('Family', 'p', 'backlog', false),
			'Projects/p.md': '---\nrole: Family\n---\n',
		});
		const untouched = root.withClass('is-untouched');
		expect(untouched).toHaveLength(1);
		expect(untouched[0]!.all().find(x => x.classes.has('twobrain-home-role-name'))!.text)
			.toBe('Family');
	});

	it('shows a role with no open work as clear, not as a warning', async () => {
		const { root } = await renderWith({});
		expect(root.withClass('is-untouched')).toHaveLength(0);
		expect(root.withClass('is-clear')).toHaveLength(5);
		expect(root.withClass('twobrain-home-role-count')[0]!.text).toBe('clear');
	});

	it('links a role to its context page when it exists, plain text when not', async () => {
		const { root } = await renderWith({
			[`Journal/${TODAY}.md`]: '# Journal',
			[`Journal/Contexts/${TODAY}-Engineer.md`]: '# Engineer',
		});
		const names = root.withClass('twobrain-home-role-name');
		const engineer = names.find(n => n.text === 'Engineer')!;
		const family = names.find(n => n.text === 'Family')!;
		expect(engineer.tag).toBe('a');
		expect(engineer.attrs['href']).toBe(`Journal/Contexts/${TODAY}-Engineer.md`);
		expect(family.tag).toBe('span');
	});

	it('flags how many of a role\'s projects need a decision', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('TechLead', 'old', 'doing', false, daysAgo(200)),
			'Projects/old.md': '---\nrole: TechLead\n---\n',
		});
		expect(root.one('twobrain-home-role-flag')!.text).toBe('1');
	});
});

describe('HomeView health signals', () => {
	it('shows only the signals that are actually firing', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('TechLead', 'old', 'doing', false, daysAgo(200)),
			// Referenced but has no Projects/ file, and nothing in `doing` —
			// so it also raises "no next action" as an implicit project.
			'Activities/a2.md': activityFile('', 'inbox', 'backlog', false),
			'Projects/old.md': '---\nrole: TechLead\n---\n',
		});
		expect(root.withClass('twobrain-home-signal').map(s => s.text))
			.toEqual(['1 stalled', '1 no next action', '1 untriaged', '1 no role']);
	});

	it('says everything is clear rather than showing zeroes', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('Engineer', 'p', 'doing', true),
			'Projects/p.md': '---\nrole: Engineer\n---\n',
		});
		expect(root.withClass('twobrain-home-signal')).toHaveLength(0);
		expect(root.one('twobrain-home-allclear')!.text)
			.toBe('Everything is triaged. Nothing is asking for you.');
	});

	it('sends each signal to the note that resolves it', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('', 'inbox', 'backlog', false),
		});
		const byText = (t: string) => root.withClass('twobrain-home-signal').find(s => s.text === t)!;
		expect(byText('1 untriaged').attrs['href']).toBe('Projects/Inbox.md');
		expect(byText('1 no role').attrs['href']).toBe('Dashboards/Eisenhower Matrix.md');
	});

	it('surfaces an aging promise as a health signal linking to People', async () => {
		const { root } = await renderWith({
			[`Journal/${daysAgo(20)}.md`]: '- [ ] Send the BOM @owed [[Ida Haugland]]',
			'People/Ida Haugland.md': '---\n---\n',
		});
		const signal = root.withClass('twobrain-home-signal').find(s => s.text === '1 promises aging');
		expect(signal).toBeDefined();
		expect(signal!.attrs['href']).toBe('Dashboards/People.md');
	});

	it('surfaces a quiet relationship as a health signal', async () => {
		// Two notes, not one: a single mention is below the history floor and
		// is deliberately treated as a name that came up, not a lapse.
		const { root } = await renderWith({
			[`Journal/${daysAgo(70)}.md`]: '- [x] Send the BOM @owed [[Ida Haugland]]',
			[`Journal/${daysAgo(80)}.md`]: 'Kicked off the BOM with [[Ida Haugland]]',
			'People/Ida Haugland.md': '---\n---\n',
		});
		const signal = root.withClass('twobrain-home-signal').find(s => s.text === '1 gone quiet');
		expect(signal).toBeDefined();
	});
});

describe('HomeView next steps', () => {
	it('offers today\'s note plus the planning and review destinations', async () => {
		const { root } = await renderWith({ [`Journal/${TODAY}.md`]: '# Journal' });
		const nav = root.withClass('twobrain-home-nav-link');
		expect(nav.map(n => n.text)).toEqual(["Today's note", 'Plan', 'Projects', 'People', 'Inbox']);
		expect(nav[0]!.attrs['href']).toBe(`Journal/${TODAY}.md`);
		expect(nav[1]!.attrs['href']).toBe('Dashboards/Eisenhower Matrix.md');
		expect(nav[2]!.attrs['href']).toBe('Dashboards/Projects.md');
	});

	it('degrades to a non-link nudge when today has no daily note', async () => {
		const { root } = await renderWith({});
		expect(root.one('twobrain-home-nav-missing')!.text).toBe('No daily note yet');
		expect(root.withClass('twobrain-home-nav-link').map(n => n.text))
			.toEqual(['Plan', 'Projects', 'People', 'Inbox']);
	});

	it('opens the note behind a link when it is clicked', async () => {
		const { root, opened } = await renderWith({ [`Journal/${TODAY}.md`]: '# Journal' });
		root.click('is-primary');
		expect(opened).toEqual([`Journal/${TODAY}.md`]);
	});

	it('lists recent days without the redundant year', async () => {
		const { root } = await renderWith({
			[`Journal/${TODAY}.md`]: '# Journal',
			'Journal/2026-01-03.md': '# Journal',
			'Journal/2026-01-01.md': '# Journal',
		});
		expect(root.withClass('twobrain-home-recent-link').map(l => l.text))
			.toEqual(['01-03', '01-01']);
	});
});

describe('HomeView scope', () => {
	it('does not embed the matrix or projects tables', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': activityFile('Engineer', 'p', 'doing', true),
			'Projects/p.md': '---\nrole: Engineer\n---\n',
		});
		expect(root.withClass('twobrain-matrix-table')).toHaveLength(0);
		expect(root.withClass('twobrain-projects-table')).toHaveLength(0);
		expect(root.find('table')).toHaveLength(0);
	});
});

describe('HomeView life balance radar', () => {
	it('draws an axis per role, labelled with its days of attention', async () => {
		const { root } = await renderWith({
			[`Journal/${TODAY}.md`]: '# Journal',
			[`Journal/Contexts/${TODAY}-Engineer.md`]: '# Engineer',
			[`Journal/${daysAgo(1)}.md`]: '# Journal',
			[`Journal/Contexts/${daysAgo(1)}-Engineer.md`]: '# Engineer',
			[`Journal/Contexts/${daysAgo(1)}-Family.md`]: '# Family',
		});

		expect(root.withClass('twobrain-radar-label').map(l => l.text))
			.toEqual(['Family', 'Engineer', 'TechLead', 'Entrepreneur', 'Selfcare']);
		expect(root.withClass('twobrain-radar-value').map(l => l.text))
			.toEqual(['1', '2', '0', '0', '0']);
	});

	it('marks a role with no attention at all rather than hiding it', async () => {
		const { root } = await renderWith({
			[`Journal/${TODAY}.md`]: '# Journal',
			[`Journal/Contexts/${TODAY}-Engineer.md`]: '# Engineer',
		});
		expect(root.withClass('twobrain-radar-dot')).toHaveLength(5);
		expect(root.withClass('is-empty')).toHaveLength(4);
	});

	it('explains itself instead of drawing an empty shape with no history', async () => {
		const { root } = await renderWith({});
		expect(root.withClass('twobrain-home-radar')).toHaveLength(0);
		expect(root.one('twobrain-home-panel-empty')!.text).toMatch(/No role history yet/);
	});
});

describe('HomeView consistency grid', () => {
	it('renders a year of days as Sunday-first week columns', async () => {
		const { root } = await renderWith({ [`Journal/${TODAY}.md`]: '# Journal' });
		const weeks = root.withClass('twobrain-home-grid-week');
		expect(weeks.length).toBeGreaterThanOrEqual(52);
		expect(weeks.every(w => w.children.length === 7)).toBe(true);
	});

	it('reports the current streak', async () => {
		const { root } = await renderWith({
			[`Journal/${TODAY}.md`]: '# Journal',
			[`Journal/${daysAgo(1)}.md`]: '# Journal',
			[`Journal/${daysAgo(2)}.md`]: '# Journal',
			[`Journal/${daysAgo(9)}.md`]: '# Journal',
		});
		expect(root.one('twobrain-home-streak-num')!.text).toBe('3');
	});

	it('opens the day behind a cell that has a note, and ignores empty ones', async () => {
		const { app, opened } = makeApp({ [`Journal/${TODAY}.md`]: '# Journal' });
		const root = new FakeEl('div');
		await new HomeView(app as any, SETTINGS, makeCacheStore()).render(root as unknown as HTMLElement);

		const written = root.withClass('twobrain-home-grid-cell')
			.filter(c => c.classes.has('is-open'));
		expect(written).toHaveLength(1);

		for (const cb of written[0]!.listeners['click'] ?? []) cb({ preventDefault() {} });
		expect(opened).toEqual([`Journal/${TODAY}.md`]);
	});

	it('counts context pages toward a day even at a nested journal path', async () => {
		const { root } = await renderWith({
			[`Journal/2026/09.September/${TODAY}.md`]: '# Journal',
			[`Journal/2026/09.September/Contexts/${TODAY}-Family.md`]: '# Family',
		});
		expect(root.withClass('twobrain-radar-value')[0]!.text).toBe('1');
	});
});

describe('HomeView people strip', () => {
	it('names who I am in touch with, not just a count', async () => {
		const { root } = await renderWith({
			[`Journal/${daysAgo(1)}.md`]: 'Synced with [[Ida Haugland]]',
			'People/Ida Haugland.md': '---\n---\n',
		});
		const names = root.withClass('twobrain-home-person').map(e => e.text);
		expect(names).toContain('Ida Haugland');
		expect(root.one('twobrain-home-people')).toBeDefined();
	});

	it('shows the strip even when nothing is wrong', async () => {
		// The health signals above only fire on a problem. Relationships must
		// not vanish from Home on a good week — that is when drift starts.
		const { root } = await renderWith({
			[`Journal/${TODAY}.md`]: 'Coffee with [[Ida Haugland]]',
			'People/Ida Haugland.md': '---\n---\n',
		});
		expect(root.withClass('twobrain-home-signal')
			.some(s => s.text.includes('quiet') || s.text.includes('aging'))).toBe(false);
		expect(root.one('twobrain-home-people')).toBeDefined();
		expect(root.one('twobrain-home-people-count')!.text).toBe('1 in touch · 0 drifting');
	});

	it('separates people I owe from people I am merely in touch with', async () => {
		const { root } = await renderWith({
			[`Journal/${daysAgo(1)}.md`]:
				'- [ ] Send the BOM @owed [[Ida Haugland]]\nCoffee with [[Frederik Stray]]',
			'People/Ida Haugland.md': '---\n---\n',
			'People/Frederik Stray.md': '---\n---\n',
		});
		const labels = root.withClass('twobrain-home-people-line-label').map(e => e.text);
		expect(labels).toEqual(['Owe', 'In touch']);
		expect(root.withClass('is-owing').map(e => e.text)).toEqual(['Ida Haugland']);
		expect(root.withClass('is-active').map(e => e.text)).toEqual(['Frederik Stray']);
	});

	it('flags a drifting relationship by name', async () => {
		const { root } = await renderWith({
			[`Journal/${daysAgo(70)}.md`]: 'Chat with [[Frederik Stray]]',
			[`Journal/${daysAgo(80)}.md`]: 'Intro to [[Frederik Stray]]',
			'People/Frederik Stray.md': '---\n---\n',
		});
		expect(root.withClass('is-quiet').map(e => e.text)).toEqual(['Frederik Stray']);
	});

	it('links a name straight to their page', async () => {
		const { root, opened } = await renderWith({
			[`Journal/${daysAgo(1)}.md`]: 'Synced with [[Ida Haugland]]',
			'People/Ida Haugland.md': '---\n---\n',
		});
		root.click('twobrain-home-person');
		expect(opened).toContain('People/Ida Haugland.md');
	});

	it('leaves the strip out entirely when there are no people at all', async () => {
		const { root } = await renderWith({ [`Journal/${TODAY}.md`]: 'Quiet day' });
		expect(root.one('twobrain-home-people')).toBeUndefined();
	});
});
