import { ExternalWorkComposer } from '../src/composers/ExternalWorkComposer';
import { ExternalWorkRequest, todoText } from '../src/components/ExternalWork';
import { dedupeGeneratedTodos } from '../src/components/ManagedRegions';
import { PLAN_SECTIONS } from '../src/components/WorkdayPlan';

class MockVault {
	files = new Map<string, string>();
	constructor(files: Record<string, string> = {}) { this.files = new Map(Object.entries(files)); }
	getAbstractFileByPath(path: string) { return this.files.has(path) ? this.f(path) : null; }
	private f(path: string) {
		const name = path.split('/').pop()!;
		return { path, name, basename: name.replace(/\.md$/, '') };
	}
	async read(file: { path: string }) { return this.files.get(file.path) ?? ''; }
	async modify(file: { path: string }, content: string) { this.files.set(file.path, content); }
	async create(path: string, content: string) { this.files.set(path, content); return this.f(path); }
	async createFolder(_p: string) {}
	getFiles() { return [...this.files.keys()].map(p => this.f(p)); }
	rename(from: string, to: string) {
		const c = this.files.get(from)!;
		this.files.delete(from);
		this.files.set(to, c);
	}
}

const SETTINGS = { journalFolder: 'Journal', activitiesFolder: 'Activities', archiveFolder: 'Activities/Archive' };
const DAY = '2026-01-05';
const ENG = `Journal/Contexts/${DAY}-Engineer.md`;
const TL = `Journal/Contexts/${DAY}-TechLead.md`;
const A = 'https://sensio.ghe.com/roommate/fw/pull/12';
const B = 'https://sensio.ghe.com/roommate/fw/pull/13';
const C = 'https://sensio.ghe.com/roommate/fw/issues/14';

function setup() {
	const vault = new MockVault();
	const composer = new ExternalWorkComposer(SETTINGS, {
		dailyNotePathForDate: d => `Journal/${d}.md`,
		linkContext: jest.fn(async () => {}),
	});
	return { vault, app: { vault } as any, composer };
}

function work(title: string, url: string, over: Partial<ExternalWorkRequest> = {}): ExternalWorkRequest {
	return {
		date: DAY, kind: 'morning',
		activity: { title, sources: [{ url, title: 'upstream' }] },
		summary: ['s'], todos: [{ action: 'review' }],
		...over,
	};
}

const plan = (items: any[], over: any = {}) => ({ date: DAY, kind: 'morning', items, ...over });
const planRe = (kind: string) => new RegExp(`2ndbrain:plan:${kind}:${DAY}:Engineer:start`);

describe('todo wording', () => {
	it('does not stack action prefixes on verb-led names', () => {
		expect(todoText('review', 'Review gateway PR')).toBe('Review gateway PR');
		expect(todoText('merge', 'Merge release branch')).toBe('Merge release branch');
		expect(todoText('continue', 'Unblock CI runner')).toBe('Unblock CI runner');
		expect(todoText('resolve-conflicts', 'Gateway firmware')).toBe('Resolve conflicts in «Gateway firmware»');
		expect(todoText('review', 'Gateway firmware')).toBe('Review in «Gateway firmware»');
	});

	it('emits resolve-conflicts as a stable generated todo', async () => {
		const { app, composer, vault } = setup();
		await composer.upsertExternalWork(app, work('Gateway firmware', A, { todos: [{ action: 'resolve-conflicts' }] }));
		const page = vault.files.get(ENG)!;
		expect(page).toContain('Resolve conflicts in «Gateway firmware»');
		expect(page).toContain(`<!-- 2ndbrain:todo:resolve-conflicts@${A} -->`);
	});
});

describe('dedupeGeneratedTodos', () => {
	const m = (id: string) => `<!-- 2ndbrain:todo:${id} -->`;

	it('folds an outside-region duplicate into the region, keeps ticks and user lines', () => {
		const out = dedupeGeneratedTodos([
			'<!-- 2ndbrain:managed:morning:start -->',
			`- [ ] Review ${m('review@x')}`,
			'<!-- 2ndbrain:managed:morning:end -->',
			`- [x] Review old wording ${m('review@x')}`,
			'- [ ] my own',
			'free note',
		]);
		expect(out.filter(l => l.includes('review@x'))).toEqual([`- [x] Review ${m('review@x')}`]);
		expect(out).toContain('- [ ] my own');
		expect(out).toContain('free note');
	});

	it('removes plain repeats of one marker', () => {
		const line = `- [ ] Merge ${m('merge@x')}`;
		const out = dedupeGeneratedTodos([line, line, line]);
		expect(out).toHaveLength(1);
	});
});

describe('upsertWorkdayPlan', () => {
	it('links user-owned Activities by URL (even after rename) in section order', async () => {
		const { app, composer, vault } = setup();
		await composer.upsertExternalWork(app, work('Gateway firmware', A));
		await composer.upsertExternalWork(app, work('Sensor calibration', B));
		vault.rename('Activities/Gateway firmware.md', 'Activities/Edge gateway.md');

		const r = await composer.upsertWorkdayPlan(app, plan([
			{ section: 'pull-next', url: B, sentence: 'Nobody has picked this up yet.' },
			{ section: 'reviews', url: A + '/files?x=1', sentence: 'Asked of you directly two days ago.' },
		]));
		expect(r.status).toBe('updated');
		expect(r.placed).toBe(2);
		const page = vault.files.get(ENG)!;
		expect(page).toContain('[[Activities/Edge gateway.md|Edge gateway]] — Asked of you directly');
		expect(page.indexOf('### Reviews waiting')).toBeLessThan(page.indexOf('### Pull next'));
		expect(page.indexOf('2ndbrain:plan:morning')).toBeLessThan(page.indexOf('## Activities'));
	});

	it('reports unknown and conflicting URLs without guessing', async () => {
		const { app, composer, vault } = setup();
		await composer.upsertExternalWork(app, work('One', A));
		await composer.upsertExternalWork(app, work('Two', B));
		vault.files.set('Activities/Two.md', vault.files.get('Activities/Two.md')!.replace(B, A));
		const r = await composer.upsertWorkdayPlan(app, plan([
			{ section: 'finish', url: A, sentence: 'x' },
			{ section: 'finish', url: C, sentence: 'y' },
		]));
		expect(r.conflicts).toHaveLength(1);
		expect(r.unresolved.map(u => u.code)).toEqual(['no-activity']);
		expect(r.placed).toBe(0);
	});

	it('caps the overview and reports omitted counts and source failures', async () => {
		const { app, composer, vault } = setup();
		await composer.upsertExternalWork(app, work('One', A));
		await composer.upsertExternalWork(app, work('Two', B));
		const r = await composer.upsertWorkdayPlan(app, plan([
			{ section: 'finish', url: A, sentence: 'first' },
			{ section: 'continue', url: B, sentence: 'second' },
		], { maxItems: 1, omitted: 2, sourceFailures: ['Azure DevOps timed out'] }));
		expect(r.placed).toBe(1);
		expect(r.omitted).toBe(3);
		const page = vault.files.get(ENG)!;
		expect(page).toContain('3 more items were left out');
		expect(page).toContain('Source gap: Azure DevOps timed out');
	});

	it('replaces only its own region on re-run and is idempotent', async () => {
		const { app, composer, vault } = setup();
		await composer.upsertExternalWork(app, work('One', A));
		const first = plan([{ section: 'finish', url: A, sentence: 'before' }]);
		await composer.upsertWorkdayPlan(app, first);
		vault.files.set(ENG, vault.files.get(ENG)!.replace('## Notes', '## Notes\nmy hand-written note'));
		expect((await composer.upsertWorkdayPlan(app, first)).status).toBe('unchanged');
		await composer.upsertWorkdayPlan(app, plan([{ section: 'continue', url: A, sentence: 'after' }]));
		const page = vault.files.get(ENG)!;
		expect(page).toContain('after');
		expect(page).not.toContain('before');
		expect(page).toContain('my hand-written note');
		expect(page.match(planRe('morning'))).toHaveLength(1);
	});

	it('survives evening and board upserts, and they survive it', async () => {
		const { app, composer, vault } = setup();
		await composer.upsertExternalWork(app, work('One', A));
		await composer.upsertWorkdayPlan(app, plan([{ section: 'finish', url: A, sentence: 'keep me' }]));
		await composer.upsertExternalWork(app, work('One', A, { kind: 'evening', summary: ['evening text'] }));
		await composer.upsertExternalWork(app, work('Health', B, { kind: 'board', summary: ['board text'] }));
		let page = vault.files.get(ENG)!;
		expect(page).toContain('keep me');
		expect(page).toContain('evening text');
		expect(vault.files.get(TL)).toContain('board text');

		await composer.upsertWorkdayPlan(app, plan([{ section: 'finish', url: A, sentence: 'evening plan' }], { kind: 'evening' }));
		await composer.upsertWorkdayPlan(app, plan([{ section: 'finish', url: A, sentence: 'new morning' }]));
		page = vault.files.get(ENG)!;
		expect(page).toContain('evening plan');
		expect(page).toContain('new morning');
		expect(page).toContain('evening text');
		expect(page.match(planRe('morning'))).toHaveLength(1);
		expect(page.match(planRe('evening'))).toHaveLength(1);
	});

	it('keeps Leadership Board Health routed to TechLead', async () => {
		const { app, composer, vault } = setup();
		await composer.upsertExternalWork(app, work('Leadership board health', B, { kind: 'board' }));
		expect(vault.files.get(TL)).toContain('Leadership board health');
		expect(vault.files.get(ENG)).toBeUndefined();
		const bad = await composer.upsertWorkdayPlan(app, plan([], { kind: 'board', role: 'Engineer' }));
		expect(bad.code).toBe('role-kind-mismatch');
	});

	it('refuses damaged markers and invalid requests without writing', async () => {
		const { app, composer, vault } = setup();
		await composer.upsertExternalWork(app, work('One', A));
		const damaged = vault.files.get(ENG)!.replace('## Activities', `<!-- 2ndbrain:plan:morning:${DAY}:Engineer:start -->\n## Activities`);
		vault.files.set(ENG, damaged);
		const r = await composer.upsertWorkdayPlan(app, plan([{ section: 'finish', url: A, sentence: 'x' }]));
		expect(r.code).toBe('plan-region-damaged');
		expect(vault.files.get(ENG)).toBe(damaged);
		expect((await composer.upsertWorkdayPlan(app, plan([{ section: 'nope', url: A, sentence: 'x' }]))).code).toBe('bad-section');
		expect((await composer.upsertWorkdayPlan(app, plan([{ section: 'finish', url: A, sentence: '' }]))).code).toBe('sentence-empty');
		expect((await composer.upsertWorkdayPlan(app, { ...plan([]), date: '2026-13-99' } as any)).code).toBe('bad-date');
	});

	describe('unlinked work (evening)', () => {
		const U = 'https://sensio.ghe.com/roommate/fw/pull/99?tab=files';
		const entry = (over: any = {}) => ({ url: U, title: 'Fix OTA retry backoff', sentence: 'Merged after review.', ...over });
		const evening = (items: any[], unlinked: any[], over: any = {}) => plan(items, { kind: 'evening', unlinked, ...over });

		it('renders a separate section after Activity sections, without creating Activities', async () => {
			const { app, composer, vault } = setup();
			await composer.upsertExternalWork(app, work('One', A));
			const before = [...vault.files.keys()].filter(p => p.startsWith('Activities/')).sort();
			const r = await composer.upsertWorkdayPlan(app, evening([{ section: 'finish', url: A, sentence: 'done' }], [entry({ title: 'Fix [OTA] | retry' })]));
			expect(r.status).toBe('updated');
			expect(r.placed).toBe(2);
			expect(r.unlinkedPlaced).toBe(1);
			const page = vault.files.get(ENG)!;
			expect(page).toContain('### Work without an Activity');
			expect(page).toContain('- [Fix OTA retry](https://sensio.ghe.com/roommate/fw/pull/99) — Merged after review.');
			expect(page.indexOf('### Finish')).toBeLessThan(page.indexOf('### Work without an Activity'));
			expect(page.indexOf('### Work without an Activity')).toBeLessThan(page.indexOf('2ndbrain:plan:evening:' + DAY + ':Engineer:end'));
			expect([...vault.files.keys()].filter(p => p.startsWith('Activities/')).sort()).toEqual(before);
		});

		it('renders alone and is idempotent / replaced on rerun', async () => {
			const { app, composer, vault } = setup();
			const first = evening([], [entry()]);
			expect((await composer.upsertWorkdayPlan(app, first)).placed).toBe(1);
			expect((await composer.upsertWorkdayPlan(app, first)).status).toBe('unchanged');
			await composer.upsertWorkdayPlan(app, evening([], [entry({ title: 'Tune gateway watchdog', sentence: 'Second pass.' })]));
			const page = vault.files.get(ENG)!;
			expect(page).toContain('Second pass.');
			expect(page).not.toContain('Merged after review.');
			expect(page.match(planRe('evening'))).toHaveLength(1);
			expect(page).not.toContain('Nothing actionable');
		});

		it('validates and canonicalizes entries', async () => {
			const { app, composer } = setup();
			const code = async (e: any) => (await composer.upsertWorkdayPlan(app, evening([], [e]))).code;
			expect(await code(entry({ url: 'ftp://x/y' }))).toBe('bad-source-url');
			expect(await code(entry({ title: '' }))).toBe('unlinked-title');
			expect(await code(entry({ title: '#99' }))).toBe('unlinked-title');
			expect(await code(entry({ title: 'PR 99' }))).toBe('unlinked-title');
			expect(await code(entry({ title: '12345' }))).toBe('unlinked-title');
			expect(await code(entry({ title: U }))).toBe('unlinked-title');
			expect(await code(entry({ sentence: '  ' }))).toBe('sentence-empty');
			expect((await composer.upsertWorkdayPlan(app, plan([], { kind: 'evening', unlinked: 'x' }))).code).toBe('bad-unlinked');
		});

		it('rejects unlinked for morning and board', async () => {
			const { app, composer, vault } = setup();
			expect((await composer.upsertWorkdayPlan(app, plan([], { unlinked: [entry()] }))).code).toBe('unlinked-not-allowed');
			expect((await composer.upsertWorkdayPlan(app, plan([], { kind: 'board', role: 'TechLead', unlinked: [entry()] }))).code).toBe('unlinked-not-allowed');
			expect(vault.files.size).toBe(0);
		});

		it('counts unlinked in cap, omitted and truncation; Activity items win the cap', async () => {
			const { app, composer, vault } = setup();
			await composer.upsertExternalWork(app, work('One', A));
			const second = entry({ url: 'https://sensio.ghe.com/roommate/fw/pull/100', title: 'Harden boot health check' });
			const r = await composer.upsertWorkdayPlan(app, evening(
				[{ section: 'finish', url: A, sentence: 'done' }], [entry(), second], { maxItems: 2, omitted: 1 }
			));
			expect(r.placed).toBe(2);
			expect(r.unlinkedPlaced).toBe(1);
			expect(r.omitted).toBe(2);
			expect(vault.files.get(ENG)).toContain('2 more items were left out');
			expect(vault.files.get(ENG)).not.toContain('Harden boot health check');
		});

		it('never lists work an Activity owns and keeps conflict behaviour', async () => {
			const { app, composer, vault } = setup();
			await composer.upsertExternalWork(app, work('One', A));
			await composer.upsertExternalWork(app, work('Two', B));
			vault.files.set('Activities/Two.md', vault.files.get('Activities/Two.md')!.replace(B, A));
			const r = await composer.upsertWorkdayPlan(app, evening([], [entry({ url: A }), entry({ url: C, title: 'Triage sensor drift' })]));
			expect(r.conflicts).toHaveLength(1);
			expect(r.placed).toBe(1);
			const owned = await composer.upsertWorkdayPlan(app, evening([], [entry({ url: C })]));
			expect(owned.placed).toBe(1);
			vault.files.set('Activities/Two.md', vault.files.get('Activities/Two.md')!.replace(A, B));
			const r2 = await composer.upsertWorkdayPlan(app, evening([], [entry({ url: B })]));
			expect(r2.placed).toBe(0);
			expect(r2.unresolved.map(u => u.code)).toEqual(['activity-exists']);
		});
	});

	it('exposes the sections in reading order', () => {
		expect([...PLAN_SECTIONS]).toEqual(['reviews', 'finish', 'continue', 'pull-next', 'blockers']);
	});
});
