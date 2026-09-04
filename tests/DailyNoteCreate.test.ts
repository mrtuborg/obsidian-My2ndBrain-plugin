import { moment, TFile } from 'obsidian';
import { createTodaysDailyNote, todaysDailyNotePath } from '../src/utilities/DailyNoteCreate';

/**
 * Creating today's daily note.
 *
 * The thing worth protecting here is that the note lands where the vault's
 * own Daily notes settings say it does. A note created in the wrong place is
 * not today's note — it is litter the rest of the plugin cannot see.
 */

const JOURNAL = 'Journal';

function makeApp(files: Record<string, string> = {}, options: unknown = undefined) {
	const store = new Map(Object.entries(files));
	const folders = new Set<string>();
	const opened: string[] = [];
	let commandRan = false;

	const handle = (p: string) => Object.assign(new TFile(), {
		path: p, basename: p.split('/').pop()!.replace(/\.md$/, ''),
	});

	const app: any = {
		vault: {
			getAbstractFileByPath: (p: string) =>
				store.has(p) ? handle(p) : (folders.has(p) ? { path: p } : null),
			read: async (f: { path: string }) => store.get(f.path) ?? '',
			create: async (p: string, c: string) => {
				if (store.has(p)) throw new Error('File already exists.');
				store.set(p, c);
				return handle(p);
			},
			createFolder: async (p: string) => {
				if (folders.has(p)) throw new Error('Folder already exists.');
				folders.add(p);
			},
		},
		workspace: {
			getLeaf: () => ({ openFile: async (f: { path: string }) => { opened.push(f.path); } }),
		},
		internalPlugins: {
			getPluginById: (id: string) =>
				id === 'daily-notes' && options !== undefined ? { instance: { options } } : null,
		},
	};

	return {
		app, store, folders, opened,
		ranCommand: () => commandRan,
		withCoreCommand: () => {
			app.commands = {
				commands: { 'daily-notes': {} },
				executeCommandById: (id: string) => {
					commandRan = id === 'daily-notes';
					return commandRan;
				},
			};
			return app;
		},
	};
}

describe('todaysDailyNotePath', () => {
	it('nests the note the way the daily notes format says', () => {
		// This vault files journals as Journal/2026/09.September/2026-09-04.md.
		const path = todaysDailyNotePath(
			{ folder: 'Journal', format: 'YYYY/MM.MMMM/YYYY-MM-DD' }, JOURNAL
		);
		expect(path).toBe(`Journal/${moment().format('YYYY/MM.MMMM/YYYY-MM-DD')}.md`);
	});

	it('falls back to a flat note in the journal folder', () => {
		expect(todaysDailyNotePath(null, JOURNAL))
			.toBe(`Journal/${moment().format('YYYY-MM-DD')}.md`);
	});

	it('uses the daily notes folder over the plugin one when they disagree', () => {
		expect(todaysDailyNotePath({ folder: 'Diary', format: 'YYYY-MM-DD' }, JOURNAL))
			.toBe(`Diary/${moment().format('YYYY-MM-DD')}.md`);
	});

	it('treats a blank format as the Obsidian default', () => {
		expect(todaysDailyNotePath({ folder: 'Journal', format: '   ' }, JOURNAL))
			.toBe(`Journal/${moment().format('YYYY-MM-DD')}.md`);
	});

	it('copes with a trailing slash on the folder', () => {
		expect(todaysDailyNotePath({ folder: 'Journal/', format: 'YYYY-MM-DD' }, JOURNAL))
			.toBe(`Journal/${moment().format('YYYY-MM-DD')}.md`);
	});
});

describe('createTodaysDailyNote', () => {
	it('lets the core Daily notes plugin do it whenever that is possible', async () => {
		// The core plugin knows the folder, the format and the template. Doing
		// it by hand would reimplement all three, slightly differently.
		const fake = makeApp();
		const app = fake.withCoreCommand();

		expect(await createTodaysDailyNote(app, JOURNAL)).toBe(true);
		expect(fake.ranCommand()).toBe(true);
		expect(fake.store.size).toBe(0);
	});

	it('creates the note itself when the core plugin is switched off', async () => {
		const fake = makeApp({}, { folder: 'Journal', format: 'YYYY/MM.MMMM/YYYY-MM-DD' });
		const path = `Journal/${moment().format('YYYY/MM.MMMM/YYYY-MM-DD')}.md`;

		expect(await createTodaysDailyNote(fake.app, JOURNAL)).toBe(true);
		expect(fake.store.has(path)).toBe(true);
	});

	it('builds every missing folder on the way down', async () => {
		const fake = makeApp({}, { folder: 'Journal', format: 'YYYY/MM.MMMM/YYYY-MM-DD' });
		await createTodaysDailyNote(fake.app, JOURNAL);

		expect(fake.folders.has('Journal')).toBe(true);
		expect(fake.folders.has(`Journal/${moment().format('YYYY')}`)).toBe(true);
		expect(fake.folders.has(`Journal/${moment().format('YYYY/MM.MMMM')}`)).toBe(true);
	});

	it('opens the note, because the plugin only fills one on open', async () => {
		const fake = makeApp({}, { folder: 'Journal', format: 'YYYY-MM-DD' });
		await createTodaysDailyNote(fake.app, JOURNAL);
		expect(fake.opened).toEqual([`Journal/${moment().format('YYYY-MM-DD')}.md`]);
	});

	it('opens a note that already exists instead of failing', async () => {
		const path = `Journal/${moment().format('YYYY-MM-DD')}.md`;
		const fake = makeApp({ [path]: 'already here' }, { folder: 'Journal', format: 'YYYY-MM-DD' });

		expect(await createTodaysDailyNote(fake.app, JOURNAL)).toBe(true);
		expect(fake.opened).toEqual([path]);
		expect(fake.store.get(path)).toBe('already here');
	});

	it('seeds the note from the configured template', async () => {
		const fake = makeApp(
			{ 'Templates/Daily.md': '## Notes\n' },
			{ folder: 'Journal', format: 'YYYY-MM-DD', template: 'Templates/Daily' }
		);
		await createTodaysDailyNote(fake.app, JOURNAL);
		expect(fake.store.get(`Journal/${moment().format('YYYY-MM-DD')}.md`)).toBe('## Notes\n');
	});

	it('still creates the note when the template is missing', async () => {
		const fake = makeApp({}, {
			folder: 'Journal', format: 'YYYY-MM-DD', template: 'Templates/Gone',
		});
		expect(await createTodaysDailyNote(fake.app, JOURNAL)).toBe(true);
		expect(fake.store.get(`Journal/${moment().format('YYYY-MM-DD')}.md`)).toBe('');
	});

	it('reports failure rather than pretending the note exists', async () => {
		const fake = makeApp({}, { folder: 'Journal', format: 'YYYY-MM-DD' });
		fake.app.vault.create = async () => { throw new Error('Read-only vault'); };

		expect(await createTodaysDailyNote(fake.app, JOURNAL)).toBe(false);
		expect(fake.opened).toEqual([]);
	});
});
