import { PeopleView } from '../src/ui/PeopleView';
import { CommitmentCache, emptyCache } from '../src/utilities/CommitmentIndex';

// Same fake as tests/ProjectsView.test.ts, extended with the bits an
// <input type="checkbox"> needs (checked/disabled) that a plain <span>
// or <a> never touches.
class FakeEl {
	children: FakeEl[] = [];
	classes = new Set<string>();
	attrs: Record<string, string> = {};
	text = '';
	value = '';
	checked = false;
	disabled = false;
	type = '';
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
	toggle(checked: boolean) {
		this.checked = checked;
		for (const cb of this.listeners['change'] ?? []) cb({ preventDefault() {} });
	}
	click() {
		for (const cb of this.listeners['click'] ?? []) cb({ preventDefault() {} });
	}
}

const flush = () => new Promise(r => setTimeout(r, 0));

const TODAY = new Date().toISOString().slice(0, 10);

function daysAgo(n: number): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - n);
	return d.toISOString().slice(0, 10);
}

function journalLine(date: string, ...lines: string[]): [string, string] {
	return [`Journal/${date}.md`, lines.join('\n')];
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
				stat: { mtime: 1 },
			})),
			create: async (p: string, c: string) => { store.set(p, c); },
			createFolder: async () => undefined,
		},
		workspace: { getLeaf: () => ({ openFile: async () => undefined }) },
	};
	return { app, store };
}

const SETTINGS = {
	journalFolder: 'Journal',
	peopleFolder: 'People',
	archiveFolder: 'People/Archive',
};

function makeCacheStore() {
	let cache: CommitmentCache | null = null;
	return {
		load: () => cache,
		save: (c: CommitmentCache) => { cache = c; },
	};
}

async function renderWith(files: Record<string, string>) {
	const { app, store } = makeApp(files);
	const cacheStore = makeCacheStore();
	const view = new PeopleView(app as any, SETTINGS, cacheStore);
	const root = new FakeEl('div');
	await view.render(root as unknown as HTMLElement);
	return { root, store, view, app, cacheStore };
}

describe('PeopleView', () => {
	it('shows the syntax-teaching empty state when nothing has been tracked yet', async () => {
		// Genuinely nothing to show: no journal history and no person pages.
		// A vault with pages has rows, and rows get the one-line hint instead.
		const { root } = await renderWith({});
		expect(root.withClass('twobrain-people-empty')).toHaveLength(1);
		expect(root.find('code').map(c => c.text)).toEqual([
			'- [ ] Send the BOM @owed [[Ida Haugland]]',
			'- [ ] Radio spec @waiting [[Frederik Stray]]',
		]);
	});

	it('counts what I owe and what I am owed', async () => {
		const { root } = await renderWith({
			...Object.fromEntries([journalLine(TODAY,
				'- [ ] Send the BOM @owed [[Ida Haugland]]',
				'- [ ] Reply about the venue @waiting [[Ida Haugland]]',
			)]),
			'People/Ida Haugland.md': '---\n---\n',
		});

		const meta = root.withClass('twobrain-people-summary-meta')[0]!;
		const texts = meta.children.map(c => c.text);
		expect(texts).toContain('1 i owe');
		expect(texts).toContain('1 waiting on');
	});

	it('marks a promise as aging once it has been open past the threshold', async () => {
		const { root } = await renderWith({
			...Object.fromEntries([journalLine(daysAgo(20),
				'- [ ] Send the BOM @owed [[Ida Haugland]]',
			)]),
			'People/Ida Haugland.md': '---\n---\n',
		});

		expect(root.find('tr').some(r => r.classes.has('twobrain-person-aging'))).toBe(true);
		const count = root.withClass('twobrain-people-summary-count')[0]!;
		expect(count.text).toBe('1');
	});

	it('flags a person mentioned in the journal who has no page', async () => {
		// An explicit People/ path resolves to a person even without a page —
		// a bare link would not (see Commitments.ts personFrom), which is why
		// this needs the prefixed form.
		const { root } = await renderWith({
			...Object.fromEntries([journalLine(TODAY,
				'- [ ] Send the BOM @owed [[People/Brand New Person]]',
			)]),
		});

		const missing = root.withClass('twobrain-people-missing')[0]!;
		expect(missing).toBeDefined();
		const chip = root.withClass('twobrain-people-chip')[0]!;
		expect(chip.text).toContain('Brand New Person');
	});

	it('creates a page when the create button is clicked', async () => {
		const { root, store } = await renderWith({
			...Object.fromEntries([journalLine(TODAY,
				'- [ ] Send the BOM @owed [[People/Brand New Person]]',
			)]),
		});

		const chip = root.withClass('twobrain-people-chip')[0]!;
		chip.click();
		await flush();

		expect(store.has('People/Brand New Person.md')).toBe(true);
	});

	it('folds people with nothing outstanding into a collapsed section', async () => {
		const { root } = await renderWith({
			'People/Quiet Person.md': '---\n---\n',
			...Object.fromEntries([journalLine(TODAY,
				'- [ ] Send the BOM @owed [[Active Person]]',
			)]),
			'People/Active Person.md': '---\n---\n',
		});

		const details = root.find('details')[0]!;
		expect(details.find('summary')[0]!.text).toContain('nothing outstanding');
		expect(root.withClass('twobrain-people-resting')[0]!.find('a').some(a => a.text === 'Quiet Person'))
			.toBe(true);
	});

	it('checking a commitment flips the checkbox on the exact journal line', async () => {
		const path = `Journal/${TODAY}.md`;
		const raw = '- [ ] Send the BOM @owed [[Ida Haugland]]';
		const { root, store } = await renderWith({
			[path]: raw,
			'People/Ida Haugland.md': '---\n---\n',
		});

		const box = root.withClass('twobrain-people-check')[0]!;
		box.toggle(true);
		await flush();

		expect(store.get(path)).toBe('- [x] Send the BOM @owed [[Ida Haugland]]');
	});

	it('does not touch the journal when the line no longer matches', async () => {
		const path = `Journal/${TODAY}.md`;
		const raw = '- [ ] Send the BOM @owed [[Ida Haugland]]';
		const { root, store, app } = await renderWith({
			[path]: raw,
			'People/Ida Haugland.md': '---\n---\n',
		});

		// The line changed underneath the view after it loaded.
		(app.vault as any).modify({ path }, '- [ ] Send the BOM, reworded @owed [[Ida Haugland]]');

		const box = root.withClass('twobrain-people-check')[0]!;
		box.toggle(true);
		await flush();

		expect(store.get(path)).toBe('- [ ] Send the BOM, reworded @owed [[Ida Haugland]]');
	});

	it('never treats the unassigned bucket as a person to create a page for', async () => {
		const { root } = await renderWith({
			...Object.fromEntries([journalLine(TODAY, '- [ ] Loose end @owed')]),
		});
		expect(root.withClass('twobrain-people-missing')).toHaveLength(0);
	});

	it('persists the scan cache after the first render', async () => {
		const { cacheStore } = await renderWith({
			...Object.fromEntries([journalLine(TODAY,
				'- [ ] Send the BOM @owed [[Ida Haugland]]',
			)]),
			'People/Ida Haugland.md': '---\n---\n',
		});
		expect(cacheStore.load()).not.toBeNull();
		expect(cacheStore.load()!.version).toBeGreaterThan(0);
	});

	it('reuses a warm cache on a second render without an empty result', async () => {
		const files = {
			...Object.fromEntries([journalLine(TODAY,
				'- [ ] Send the BOM @owed [[Ida Haugland]]',
			)]),
			'People/Ida Haugland.md': '---\n---\n',
		};
		const { app, store } = makeApp(files);
		const cacheStore = makeCacheStore();
		const view = new PeopleView(app as any, SETTINGS, cacheStore);
		const root1 = new FakeEl('div');
		await view.render(root1 as unknown as HTMLElement);
		const root2 = new FakeEl('div');
		await view.render(root2 as unknown as HTMLElement);

		expect(root2.withClass('twobrain-people-owed')[0]!.text).toBe('1');
		void store;
	});
});

describe('PeopleView contact reporting', () => {
	// The whole point of the rework: a vault that never adopted @owed/@waiting
	// must still get a useful page out of the [[Person]] links it already has.
	it('reports people from plain mentions even with no commitments at all', async () => {
		const { root } = await renderWith({
			...Object.fromEntries([journalLine(daysAgo(1), 'Synced with [[Ida Haugland]]')]),
			...Object.fromEntries([journalLine(daysAgo(3), 'Kickoff with [[Ida Haugland]]')]),
			'People/Ida Haugland.md': '---\n---\n',
		});
		expect(root.withClass('twobrain-people-empty')).toHaveLength(0);
		expect(root.withClass('twobrain-people-contact')[0]!.text).toBe('2 days');
	});

	it('splits gone-quiet from in-touch so the two never read as one pile', async () => {
		const { root } = await renderWith({
			...Object.fromEntries([journalLine(daysAgo(1), 'Synced with [[Ida Haugland]]')]),
			...Object.fromEntries([journalLine(daysAgo(3), 'Kickoff with [[Ida Haugland]]')]),
			...Object.fromEntries([journalLine(daysAgo(90), 'Chat with [[Frederik Stray]]')]),
			...Object.fromEntries([journalLine(daysAgo(95), 'Intro to [[Frederik Stray]]')]),
			'People/Ida Haugland.md': '---\n---\n',
			'People/Frederik Stray.md': '---\n---\n',
		});
		const titles = root.withClass('twobrain-people-section-title').map(e => e.text);
		expect(titles).toEqual(['Gone quiet', 'In touch']);
	});

	it('keeps a note that is about people rather than a person out of the table', async () => {
		const { root } = await renderWith({
			...Object.fromEntries([journalLine(daysAgo(1),
				'Ran [[People/EELS-W33-iteration]] with [[Ida Haugland]]')]),
			'People/EELS-W33-iteration.md': '---\n---\n',
			'People/Ida Haugland.md': '---\n---\n',
		});
		const names = root.withClass('twobrain-people-name').map(e => e.text || e.children[0]?.text);
		expect(names).toEqual(['Ida Haugland']);
	});
});

describe('empty cache helper', () => {
	it('starts at the current cache version with no entries', () => {
		const cache = emptyCache();
		expect(cache.entries).toEqual({});
	});
});
