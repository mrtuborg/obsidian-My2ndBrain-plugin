import { HomeView } from '../src/ui/HomeView';

// Same fake as tests/ProjectsView.test.ts / tests/MatrixView.test.ts — HomeView
// only touches empty/addClass/setText/createEl/createDiv/createSpan/
// setAttribute/addEventListener, and so do the MatrixView/ProjectsView
// instances it embeds, so this one fake covers the whole tree.
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
}

const TODAY = new Date().toISOString().slice(0, 10);

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
	journalFolder: 'Journal',
};

async function renderWith(files: Record<string, string>) {
	const { app } = makeApp(files);
	const view = new HomeView(app as any, SETTINGS);
	const root = new FakeEl('div');
	await view.render(root as unknown as HTMLElement);
	return { root, view };
}

describe('HomeView', () => {
	it('links to today\'s daily note when it exists', async () => {
		const { root } = await renderWith({ [`Journal/${TODAY}.md`]: '# Journal' });
		const link = root.withClass('twobrain-home-today-link')[0]!;
		expect(link.text).toBe(`Today · ${TODAY}`);
		expect(link.attrs['href']).toBe(`Journal/${TODAY}.md`);
	});

	it('shows a non-link nudge when today has no daily note yet', async () => {
		const { root } = await renderWith({});
		expect(root.withClass('twobrain-home-today-link')).toHaveLength(0);
		expect(root.withClass('twobrain-home-today-missing')[0]!.text)
			.toBe(`Today · ${TODAY} — no daily note yet`);
	});

	it('links a role to its Context page when the page already exists', async () => {
		const { root } = await renderWith({
			[`Journal/${TODAY}.md`]: '# Journal',
			[`Journal/Contexts/${TODAY}-Engineer.md`]: '# Engineer',
		});
		const chips = root.withClass('twobrain-home-role-chip');
		const engineer = chips.find(c => c.text === 'Engineer')!;
		expect(engineer.classes.has('twobrain-home-role-ready')).toBe(true);
		expect(engineer.attrs['href']).toBe(`Journal/Contexts/${TODAY}-Engineer.md`);
	});

	it('shows a role as pending (no link) when its Context page does not exist', async () => {
		const { root } = await renderWith({ [`Journal/${TODAY}.md`]: '# Journal' });
		const chips = root.withClass('twobrain-home-role-chip');
		const engineer = chips.find(c => c.text === 'Engineer')!;
		expect(engineer.classes.has('twobrain-home-role-pending')).toBe(true);
		expect(engineer.attrs['href']).toBeUndefined();
	});

	it('shows no role chips as ready when there is no daily note yet to hang Contexts off of', async () => {
		const { root } = await renderWith({});
		const ready = root.withClass('twobrain-home-role-ready');
		expect(ready).toHaveLength(0);
	});

	it('surfaces an inbox-pressure line only when there is untriaged work', async () => {
		const withInbox = await renderWith({
			'Activities/a1.md': [
				'---', 'startDate: 2026-01-01', 'stage: backlog', 'responsible: [Me]',
				'project: inbox', '---', '',
			].join('\n'),
		});
		expect(withInbox.root.withClass('twobrain-home-inbox')).toHaveLength(1);
		expect(withInbox.root.withClass('twobrain-home-inbox')[0]!.find('a')[0]!.text)
			.toBe('1 untriaged in Inbox');

		const empty = await renderWith({});
		expect(empty.root.withClass('twobrain-home-inbox')).toHaveLength(0);
	});

	it('lists recent journal entries, most recent first, excluding today', async () => {
		const { root } = await renderWith({
			[`Journal/${TODAY}.md`]: '# Journal',
			'Journal/2026-01-01.md': '# Journal',
			'Journal/2026-01-03.md': '# Journal',
		});
		const links = root.withClass('twobrain-home-recent-link');
		expect(links.map(l => l.text)).toEqual(['2026-01-03', '2026-01-01']);
	});

	it('renders the embedded matrix and projects sections', async () => {
		const { root } = await renderWith({
			'Activities/a1.md': [
				'---', 'startDate: 2026-01-01', 'stage: doing', 'responsible: [Me]',
				'project: roommate', 'role: Engineer', 'takeToWork: true', '---', '',
			].join('\n'),
			'Projects/roommate.md': '---\nrole: Engineer\n---\n',
		});
		expect(root.find('h3').map(h => h.text)).toEqual(['Take to work', 'Projects']);
		expect(root.withClass('twobrain-matrix-table').length).toBeGreaterThan(0);
		expect(root.withClass('twobrain-projects-table').length).toBeGreaterThan(0);
	});
});
