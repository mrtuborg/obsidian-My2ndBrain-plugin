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
	fire(type: string) {
		for (const cb of this.listeners[type] ?? []) cb({ preventDefault() {} });
	}
	/** The checklist row for one person, by the name shown on it. */
	row(name: string): FakeEl | undefined {
		return this.withClass('twobrain-home-contact')
			.find(r => r.all().some(c => c.classes.has('twobrain-home-contact-name') && c.text === name));
	}
}

const TODAY = new Date().toISOString().slice(0, 10);

/** Lets the async click handler and the re-render it triggers finish. */
const flush = () => new Promise(r => setTimeout(r, 0));

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
	// Flat `key: value` frontmatter is all the checklist stores, so the fake
	// parser only has to handle that much.
	const frontmatterOf = (p: string): Record<string, unknown> => {
		const text = store.get(p) ?? '';
		const m = /^---\n([\s\S]*?)\n---/.exec(text);
		if (!m) return {};
		const fm: Record<string, unknown> = {};
		for (const line of m[1]!.split('\n')) {
			const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
			if (kv) fm[kv[1]!] = kv[2]!.trim();
		}
		return fm;
	};

	const writeFrontmatter = (p: string, fm: Record<string, unknown>) => {
		const text = store.get(p) ?? '';
		const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
		const keys = Object.keys(fm);
		store.set(p, keys.length === 0
			? body
			: `---\n${keys.map(k => `${k}: ${String(fm[k])}`).join('\n')}\n---\n${body}`);
	};

	const app = {
		vault: {
			getAbstractFileByPath: (p: string) => (store.has(p) ? handle(p) : null),
			read: async (f: { path: string }) => store.get(f.path) ?? '',
			modify: async (f: { path: string }, c: string) => { store.set(f.path, c); },
			// Obsidian's atomic read-modify-write. Modelled here because the
			// checklist relies on it to not lose one of two contacts ticked
			// off in quick succession.
			process: async (f: { path: string }, fn: (data: string) => string) => {
				const next = fn(store.get(f.path) ?? '');
				store.set(f.path, next);
				return next;
			},
			getFiles: () => [...store.keys()].map(handle),
		},
		metadataCache: {
			getFileCache: (f: { path: string }) => ({ frontmatter: frontmatterOf(f.path) }),
		},
		fileManager: {
			processFrontMatter: async (
				f: { path: string }, fn: (fm: Record<string, unknown>) => void
			) => {
				const fm = frontmatterOf(f.path);
				fn(fm);
				writeFrontmatter(f.path, fm);
			},
		},
		workspace: {
			getLeaf: () => ({
				openFile: async (f: { path: string }) => { opened.push(f.path); },
			}),
		},
	};
	return { app, opened, store };
}

function makeCacheStore() {
	let cache: any = null;
	return { load: () => cache, save: (c: any) => { cache = c; } };
}

async function renderWith(files: Record<string, string>) {
	const { app, opened, store } = makeApp(files);
	const root = new FakeEl('div');
	await new HomeView(app as any, SETTINGS, makeCacheStore()).render(root as unknown as HTMLElement);
	return { root, opened, store, app };
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

describe('HomeView communication checklist', () => {
	it('never folds an active contact away, however many there are', async () => {
		// The list is sorted by silence, so a cap hides exactly the people you
		// have neglected longest — and a checklist you must unfold to finish
		// is one you stop finishing. Length is managed by filing, not hiding.
		const letters = 'ABCDEFGHIJKLMNOPQRSTUVWX';
		const names = [...letters].map(c => `Person ${c}${c.toLowerCase()}`);
		const files: Record<string, string> = {};
		names.forEach((name, i) => {
			files[`Journal/${daysAgo(i + 2)}.md`] = `Spoke to [[${name}]]`;
			files[`People/${name}.md`] = '---\n---\n';
		});

		const { root } = await renderWith(files);

		expect(root.withClass('twobrain-home-contact-name')).toHaveLength(24);
		for (const name of names) expect(root.row(name)).toBeDefined();
		expect(root.withClass('twobrain-home-fold')).toHaveLength(0);
	});

	it('lists each contact with how long since I last spoke to them', async () => {
		const { root } = await renderWith({
			[`Journal/${daysAgo(1)}.md`]: 'Synced with [[Ida Haugland]]',
			'People/Ida Haugland.md': '---\n---\n',
		});
		const row = root.row('Ida Haugland');
		expect(row).toBeDefined();
		expect(row!.one('twobrain-home-contact-age')!.text).toBe('yesterday');
	});

	it('puts the longest silence first — that is the whole point of the list', async () => {
		const { root } = await renderWith({
			[`Journal/${daysAgo(2)}.md`]: 'Coffee with [[Ida Haugland]]',
			[`Journal/${daysAgo(40)}.md`]: 'Chat with [[Frederik Stray]]',
			'People/Ida Haugland.md': '---\n---\n',
			'People/Frederik Stray.md': '---\n---\n',
		});
		const names = root.withClass('twobrain-home-contact-name').map(e => e.text);
		expect(names).toEqual(['Frederik Stray', 'Ida Haugland']);
	});

	it('flags a contact past the reach-out threshold', async () => {
		const { root } = await renderWith({
			[`Journal/${daysAgo(40)}.md`]: 'Chat with [[Frederik Stray]]',
			'People/Frederik Stray.md': '---\n---\n',
		});
		expect(root.row('Frederik Stray')!.classes.has('is-overdue')).toBe(true);
		expect(root.one('twobrain-home-people-count')!.text).toContain('1 to reach out to');
	});

	it('sinks someone already logged today to the bottom and strikes them out', async () => {
		const { root } = await renderWith({
			[`Journal/${TODAY}.md`]: 'Coffee with [[Ida Haugland]]',
			[`Journal/${daysAgo(40)}.md`]: 'Chat with [[Frederik Stray]]',
			'People/Ida Haugland.md': '---\n---\n',
			'People/Frederik Stray.md': '---\n---\n',
		});
		const names = root.withClass('twobrain-home-contact-name').map(e => e.text);
		expect(names).toEqual(['Frederik Stray', 'Ida Haugland']);
		expect(root.row('Ida Haugland')!.classes.has('is-logged')).toBe(true);
		expect(root.one('twobrain-home-people-count')!.text).toContain('1 logged today');
	});

	it('links a name straight to their page', async () => {
		const { root, opened } = await renderWith({
			[`Journal/${daysAgo(1)}.md`]: 'Synced with [[Ida Haugland]]',
			'People/Ida Haugland.md': '---\n---\n',
		});
		root.click('twobrain-home-contact-name');
		expect(opened).toContain('People/Ida Haugland.md');
	});

	it('leaves the section out entirely when there are no people at all', async () => {
		const { root } = await renderWith({ [`Journal/${TODAY}.md`]: 'Quiet day' });
		expect(root.one('twobrain-home-people')).toBeUndefined();
	});

	it('drops people the journal names but the vault has no page for', async () => {
		// There is nowhere to file a status without a file. The People
		// dashboard already offers to create the page.
		const { root } = await renderWith({
			[`Journal/${daysAgo(1)}.md`]: 'Synced with [[People/Nobody Here]]',
		});
		expect(root.one('twobrain-home-people')).toBeUndefined();
	});
});

describe('HomeView checklist check-off', () => {
	const check = (root: FakeEl, name: string, checked: boolean) => {
		const box = root.row(name)!.one('twobrain-home-contact-check')!;
		(box as any).checked = checked;
		box.fire('change');
	};

	it("writes a header block into today's note", async () => {
		const { root, store } = await renderWith({
			[`Journal/${TODAY}.md`]: 'Some work\n',
			[`Journal/${daysAgo(40)}.md`]: 'Chat with [[Frederik Stray]]',
			'People/Frederik Stray.md': '---\n---\n',
		});
		check(root, 'Frederik Stray', true);
		await flush();
		expect(store.get(`Journal/${TODAY}.md`)).toContain('#### Talked to [[People/Frederik Stray]]');
	});

	it('appends rather than replacing what is already in the note', async () => {
		const { root, store } = await renderWith({
			[`Journal/${TODAY}.md`]: '## Notes\nSomething I wrote\n',
			[`Journal/${daysAgo(40)}.md`]: 'Chat with [[Frederik Stray]]',
			'People/Frederik Stray.md': '---\n---\n',
		});
		check(root, 'Frederik Stray', true);
		await flush();
		const text = store.get(`Journal/${TODAY}.md`)!;
		expect(text).toContain('Something I wrote');
		expect(text.trimEnd().endsWith('#### Talked to [[People/Frederik Stray]]\n\n----'.trimEnd()))
			.toBe(true);
	});

	it('disables the check when there is no note for today to write into', async () => {
		const { root } = await renderWith({
			[`Journal/${daysAgo(40)}.md`]: 'Chat with [[Frederik Stray]]',
			'People/Frederik Stray.md': '---\n---\n',
		});
		const box = root.row('Frederik Stray')!.one('twobrain-home-contact-check')!;
		expect((box as any).disabled).toBe(true);
	});

	it('offers to create the missing note rather than just naming the problem', async () => {
		// A dead checkbox with an explanation is still a dead end. The one
		// action that fixes it belongs next to the explanation.
		const { root, app } = await renderWith({
			[`Journal/${daysAgo(40)}.md`]: 'Chat with [[Frederik Stray]]',
			'People/Frederik Stray.md': '---\n---\n',
		});
		let ran = '';
		app.commands = {
			commands: { 'daily-notes': {} },
			executeCommandById: (id: string) => { ran = id; return true; },
		};

		const create = root.one('twobrain-home-checklist-create');
		expect(create).toBeDefined();
		expect(create!.tag).toBe('button');
		create!.fire('click');
		await flush();

		expect(ran).toBe('daily-notes');
	});

	it('says nothing about a missing note when there is nobody to tick off', async () => {
		const { root } = await renderWith({});
		expect(root.one('twobrain-home-checklist-note')).toBeUndefined();
	});

	it('removes only a block the checklist itself wrote', async () => {
		const { root, store } = await renderWith({
			[`Journal/${TODAY}.md`]: '## Notes\nReal work\n#### Talked to [[People/Frederik Stray]]\n\n----\n',
			'People/Frederik Stray.md': '---\n---\n',
		});
		check(root, 'Frederik Stray', false);
		await flush();
		const text = store.get(`Journal/${TODAY}.md`)!;
		expect(text).not.toContain('Talked to');
		expect(text).toContain('Real work');
	});

	it('removes notes written inside the block along with it', async () => {
		const { root, store } = await renderWith({
			[`Journal/${TODAY}.md`]:
				'## Notes\nReal work\n#### Talked to [[People/Frederik Stray]]\n\nCalled about the BOM.\n\n----\n',
			'People/Frederik Stray.md': '---\n---\n',
		});
		check(root, 'Frederik Stray', false);
		await flush();
		const text = store.get(`Journal/${TODAY}.md`)!;
		expect(text).not.toContain('Talked to');
		expect(text).not.toContain('Called about the BOM');
		expect(text).toContain('Real work');
	});

	it('refuses to empty the note rather than writing a blank file', async () => {
		// FileIO guards against blanking a note, so the write would be dropped
		// on the floor and the checkbox would spring back with no explanation.
		const { root, store } = await renderWith({
			[`Journal/${TODAY}.md`]: '#### Talked to [[People/Frederik Stray]]\n\n----\n',
			'People/Frederik Stray.md': '---\n---\n',
		});
		check(root, 'Frederik Stray', false);
		await flush();
		expect(store.get(`Journal/${TODAY}.md`)).toContain('#### Talked to [[People/Frederik Stray]]');
	});

	it('leaves a real journal sentence alone when unchecked', async () => {
		const { root, store } = await renderWith({
			[`Journal/${TODAY}.md`]: 'Long call with [[Frederik Stray]] about the BOM\n',
			'People/Frederik Stray.md': '---\n---\n',
		});
		check(root, 'Frederik Stray', false);
		await flush();
		expect(store.get(`Journal/${TODAY}.md`)).toContain('Long call with [[Frederik Stray]]');
	});
});

describe('HomeView contact status', () => {
	const press = (root: FakeEl, name: string, label: string) => {
		const button = root.row(name)!.withClass('twobrain-home-contact-action')
			.find(b => b.attrs['aria-label'] === `${label} ${name}`);
		expect(button).toBeDefined();
		button!.fire('click');
	};

	const files = {
		[`Journal/${daysAgo(40)}.md`]: 'Chat with [[Frederik Stray]]',
		'People/Frederik Stray.md': '---\nstartDate: 2026-01-01\n---\n',
	};

	it('files a contact as inactive without moving the file', async () => {
		const { root, store } = await renderWith(files);
		press(root, 'Frederik Stray', 'Pause');
		await flush();
		expect(store.get('People/Frederik Stray.md')).toContain('contactStatus: inactive');
		expect(store.has('People/Frederik Stray.md')).toBe(true);
	});

	it('keeps frontmatter it did not put there', async () => {
		const { root, store } = await renderWith(files);
		press(root, 'Frederik Stray', 'Archive');
		await flush();
		expect(store.get('People/Frederik Stray.md')).toContain('startDate: 2026-01-01');
	});

	it('folds archived contacts away with a restore button on each row', async () => {
		const { root } = await renderWith({
			[`Journal/${daysAgo(40)}.md`]: 'Chat with [[Frederik Stray]]',
			'People/Frederik Stray.md': '---\ncontactStatus: archived\n---\n',
		});
		const fold = root.one('twobrain-home-fold');
		expect(fold).toBeDefined();
		expect(fold!.one('twobrain-home-fold-summary')!.text).toBe('Archived · 1');
		expect((fold as any).open).toBe(false);
		expect(root.row('Frederik Stray')!.withClass('twobrain-home-contact-action')
			.map(b => b.attrs['aria-label'])).toEqual(['Activate Frederik Stray']);
	});

	it('moves an archived contact back to active', async () => {
		const { root, store } = await renderWith({
			[`Journal/${daysAgo(40)}.md`]: 'Chat with [[Frederik Stray]]',
			'People/Frederik Stray.md': '---\ncontactStatus: archived\n---\n',
		});
		press(root, 'Frederik Stray', 'Activate');
		await flush();
		expect(store.get('People/Frederik Stray.md')).not.toContain('contactStatus');
	});

	it('shows the move even while the metadata cache is still stale', async () => {
		// `processFrontMatter` writes the file, but the cache the next render
		// reads from refreshes asynchronously. Without holding the pending
		// value the row redraws exactly where it was and the button looks dead.
		const { root, app } = await renderWith(files);
		app.metadataCache.getFileCache = () => ({ frontmatter: {} });

		press(root, 'Frederik Stray', 'Pause');
		await flush();

		const fold = root.withClass('twobrain-home-fold')
			.find(f => f.one('twobrain-home-fold-summary')!.text.startsWith('Inactive'));
		expect(fold).toBeDefined();
		expect(fold!.row('Frederik Stray')).toBeDefined();
	});

	it('does not let a pending value outlive the write it stood in for', async () => {
		// The optimistic override self-clears once the cache agrees. If it did
		// not, the first status a contact was given would be frozen forever.
		const { root, store } = await renderWith(files);
		press(root, 'Frederik Stray', 'Pause');
		await flush();
		press(root, 'Frederik Stray', 'Activate');
		await flush();

		expect(store.get('People/Frederik Stray.md')).not.toContain('contactStatus');
		expect(root.row('Frederik Stray')).toBeDefined();
		expect(root.withClass('twobrain-home-fold')).toHaveLength(0);
	});

	it('keeps an explicit status for someone the Archive folder would archive', async () => {
		// Path and field disagree; the field the user set has to win, or
		// "move back to active" silently does nothing for archived people.
		const { root } = await renderWith({
			[`Journal/${daysAgo(40)}.md`]: 'Chat with [[People/Archive/Frederik Stray]]',
			'People/Archive/Frederik Stray.md': '---\ncontactStatus: active\n---\n',
		});
		expect(root.row('Frederik Stray')).toBeDefined();
		expect(root.row('Frederik Stray')!.classes.has('is-overdue')).toBe(true);
	});

	it('stops reporting a paused contact as drifting', async () => {
		// You said their silence is fine. Continuing to raise it as a health
		// signal is the plugin arguing with the user.
		const { root } = await renderWith({
			[`Journal/${daysAgo(70)}.md`]: 'Chat with [[Frederik Stray]]',
			[`Journal/${daysAgo(80)}.md`]: 'Intro to [[Frederik Stray]]',
			'People/Frederik Stray.md': '---\ncontactStatus: inactive\n---\n',
		});
		expect(root.withClass('twobrain-home-signal')
			.some(s => s.text.includes('quiet'))).toBe(false);
	});
});
