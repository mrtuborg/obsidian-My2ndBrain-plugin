import { backfillTakeToWork } from '../src/commands/BackfillTakeToWork';

const SETTINGS = { activitiesFolder: 'Activities', archiveFolder: 'Activities/Archive' };

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
	} as any;
	return { app, store, saves };
}

function activity(stage: string, extra: string[] = []): string {
	return ['---', 'startDate: 2026-01-05', `stage: ${stage}`, ...extra, 'responsible: [Me]', '---', '', 'body'].join('\n');
}

describe('backfillTakeToWork', () => {
	// The migration is a clean slate, NOT a behaviour-preserving translation of
	// `stage`. Stamping `doing` activities true would hand the user a day they
	// never planned — exactly what this field exists to stop.
	it('stamps false everywhere, whatever the stage, so the user starts empty-handed', async () => {
		const { app, store, saves } = makeApp({
			'Activities/doing.md': activity('doing'),
			'Activities/backlog.md': activity('backlog'),
			'Activities/done.md': activity('done'),
		});

		const result = await backfillTakeToWork(app, SETTINGS);

		expect(result.stamped).toBe(3);
		expect(saves).toHaveLength(3);
		expect(store.get('Activities/doing.md')).toContain('takeToWork: false');
		expect(store.get('Activities/backlog.md')).toContain('takeToWork: false');
		expect(store.get('Activities/done.md')).toContain('takeToWork: false');
	});

	it('does not overwrite a real decision the user already made', async () => {
		const { app, store, saves } = makeApp({
			'Activities/chosen.md': activity('backlog', ['takeToWork: true']),
		});

		await backfillTakeToWork(app, SETTINGS);

		expect(saves).toHaveLength(0);
		expect(store.get('Activities/chosen.md')).toContain('takeToWork: true');
	});

	it('leaves activities that already carry the field untouched', async () => {
		const { app, saves } = makeApp({
			'Activities/already.md': activity('doing', ['takeToWork: false']),
		});

		const result = await backfillTakeToWork(app, SETTINGS);

		expect(result.scanned).toBe(1);
		expect(result.stamped).toBe(0);
		expect(saves).toHaveLength(0);
	});

	it('is idempotent across repeated runs', async () => {
		const { app, store, saves } = makeApp({ 'Activities/a.md': activity('doing') });

		await backfillTakeToWork(app, SETTINGS);
		const afterFirst = store.get('Activities/a.md');
		await backfillTakeToWork(app, SETTINGS);

		expect(store.get('Activities/a.md')).toBe(afterFirst);
		expect(saves).toHaveLength(1);
	});

	it('skips archived activities and non-markdown files', async () => {
		const { app, saves } = makeApp({
			'Activities/Archive/old.md': activity('doing'),
			'Activities/notes.txt': activity('doing'),
			'Projects/p.md': activity('doing'),
		});

		const result = await backfillTakeToWork(app, SETTINGS);

		expect(result.scanned).toBe(0);
		expect(saves).toHaveLength(0);
	});

	it('inserts the field right after stage, preserving all other lines', async () => {
		const { app, store } = makeApp({ 'Activities/a.md': activity('doing') });

		await backfillTakeToWork(app, SETTINGS);

		expect(store.get('Activities/a.md')!.split('\n').slice(0, 5)).toEqual([
			'---', 'startDate: 2026-01-05', 'stage: doing', 'takeToWork: false', 'responsible: [Me]',
		]);
	});

	it('skips oversized activities instead of rewriting them', async () => {
		const huge = activity('doing') + '\n' + 'x'.repeat(800 * 1024);
		const { app, saves } = makeApp({ 'Activities/huge.md': huge });

		const result = await backfillTakeToWork(app, SETTINGS);

		expect(result.skipped).toBe(1);
		expect(result.stamped).toBe(0);
		expect(saves).toHaveLength(0);
	});
});
