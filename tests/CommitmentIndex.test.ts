import {
	scanCommitments, knownPeople, emptyCache, CACHE_VERSION,
} from '../src/utilities/CommitmentIndex';
import { AppLike } from '../src/utilities/FileIO';

interface FakeFile { path: string; name: string; basename: string; stat: { mtime: number } }

class FakeVault {
	reads = 0;
	files = new Map<string, { text: string; mtime: number }>();

	set(path: string, text: string, mtime = 1) {
		this.files.set(path, { text, mtime });
	}

	app(): AppLike {
		const self = this;
		return {
			vault: {
				getFiles: () => [...self.files.keys()].map(path => {
					const basename = path.replace(/^.*\//, '').replace(/\.md$/, '');
					return {
						path, basename, name: basename + '.md',
						stat: { mtime: self.files.get(path)!.mtime },
					} as FakeFile;
				}) as never,
				getAbstractFileByPath: (path: string) =>
					self.files.has(path) ? ({ path, name: path, basename: path } as never) : null,
				read: async (file: { path: string }) => {
					self.reads++;
					return self.files.get(file.path)!.text;
				},
				modify: async () => undefined,
				create: async () => undefined,
				createFolder: async () => undefined,
			},
		};
	}
}

function vaultWithPeople(): FakeVault {
	const v = new FakeVault();
	v.set('People/Ida Haugland.md', '');
	v.set('People/Frederik Stray.md', '');
	v.set('People/Archive/Tuva Moxnes.md', '');
	return v;
}

describe('knownPeople', () => {
	it('collects active and archived names alike', () => {
		const known = knownPeople(vaultWithPeople().app(), 'People');
		expect(known.has('ida haugland')).toBe(true);
		expect(known.has('tuva moxnes')).toBe(true);
	});

	it('ignores files outside the people folder', () => {
		const v = vaultWithPeople();
		v.set('Activities/Some Activity.md', '');
		const known = knownPeople(v.app(), 'People');
		expect(known.has('some activity')).toBe(false);
	});
});

describe('scanCommitments', () => {
	it('finds commitments in daily notes', async () => {
		const v = vaultWithPeople();
		v.set('Journal/2026-08-01.md', '- [ ] Send BOM @owed [[Ida Haugland]]');

		const res = await scanCommitments(v.app(), 'Journal', 'People', null);
		expect(res.commitments).toHaveLength(1);
		expect(res.commitments[0]!.person).toBe('Ida Haugland');
		expect(res.commitments[0]!.born).toBe('2026-08-01');
	});

	it('skips context pages so a promise is not counted twice', async () => {
		const v = vaultWithPeople();
		v.set('Journal/2026-08-01.md', '- [ ] Send BOM @owed [[Ida Haugland]]');
		v.set('Journal/Contexts/2026-08-01-Engineer.md', '- [ ] Send BOM @owed [[Ida Haugland]]');

		const res = await scanCommitments(v.app(), 'Journal', 'People', null);
		expect(res.scanned).toBe(1);
		expect(res.commitments).toHaveLength(1);
	});

	it('records the most recent mention of each person', async () => {
		const v = vaultWithPeople();
		v.set('Journal/2026-08-01.md', 'Talked to [[Ida Haugland]]');
		v.set('Journal/2026-08-20.md', 'Talked to [[Ida Haugland]] again');
		v.set('Journal/2026-07-01.md', 'Met [[Frederik Stray]]');

		const res = await scanCommitments(v.app(), 'Journal', 'People', null);
		expect(res.contact.get('Ida Haugland')?.lastSeen).toBe('2026-08-20');
		expect(res.contact.get('Frederik Stray')?.lastSeen).toBe('2026-07-01');
	});

	it('counts one day of contact per note, not per mention', async () => {
		const v = vaultWithPeople();
		v.set('Journal/2026-08-01.md', '[[Ida Haugland]] and [[Ida Haugland]] again');
		v.set('Journal/2026-08-20.md', 'Talked to [[Ida Haugland]]');

		const res = await scanCommitments(v.app(), 'Journal', 'People', null);
		expect(res.contact.get('Ida Haugland')).toEqual({
			days: 2, firstSeen: '2026-08-01', lastSeen: '2026-08-20',
		});
	});

	it('ignores People notes that are clearly not people', async () => {
		const v = vaultWithPeople();
		v.set('People/EELS-W33-iteration.md', '');
		v.set('People/Communications-overview.md', '');
		v.set('People/Meetings/Standup.md', '');
		v.set('Journal/2026-08-01.md',
			'[[People/EELS-W33-iteration]] [[People/Communications-overview]] ' +
			'[[People/Meetings/Standup]] [[Ida Haugland]]');

		const res = await scanCommitments(v.app(), 'Journal', 'People', null);
		expect([...res.contact.keys()]).toEqual(['Ida Haugland']);
	});

	it('folds a carried-forward promise across notes into one', async () => {
		const v = vaultWithPeople();
		v.set('Journal/2026-08-01.md', '- [ ] Send BOM @owed [[Ida Haugland]]');
		v.set('Journal/2026-08-10.md', '- [ ] Send BOM @owed [[Ida Haugland]]');
		v.set('Journal/2026-08-20.md', '- [x] Send BOM @owed [[Ida Haugland]]');

		const res = await scanCommitments(v.app(), 'Journal', 'People', null);
		expect(res.commitments).toHaveLength(1);
		expect(res.commitments[0]!.born).toBe('2026-08-01');
		expect(res.commitments[0]!.done).toBe('2026-08-20');
	});
});

describe('caching', () => {
	it('re-reads nothing when no file changed', async () => {
		const v = vaultWithPeople();
		v.set('Journal/2026-08-01.md', '- [ ] Send BOM @owed [[Ida Haugland]]');

		const first = await scanCommitments(v.app(), 'Journal', 'People', null);
		const coldReads = v.reads;
		expect(coldReads).toBeGreaterThan(0);

		v.reads = 0;
		await scanCommitments(v.app(), 'Journal', 'People', first.cache);
		expect(v.reads).toBe(0);
	});

	it('gives the same answer warm as cold', async () => {
		const v = vaultWithPeople();
		v.set('Journal/2026-08-01.md', [
			'### Planning [[Frederik Stray]]',
			'- [ ] Spec @waiting',
			'- [ ] Send BOM @owed [[Ida Haugland]]',
		].join('\n'));

		const cold = await scanCommitments(v.app(), 'Journal', 'People', null);
		const warm = await scanCommitments(v.app(), 'Journal', 'People', cold.cache);
		expect(warm.commitments).toEqual(cold.commitments);
		expect([...warm.contact]).toEqual([...cold.contact]);
	});

	it('keeps contact recency for people who were only ever mentioned, on a cache hit', async () => {
		const v = vaultWithPeople();
		// Frederik is mentioned but never promised anything — the case that
		// breaks if only commitment people are cached.
		v.set('Journal/2026-08-01.md', 'Good chat with [[Frederik Stray]]');

		const cold = await scanCommitments(v.app(), 'Journal', 'People', null);
		const warm = await scanCommitments(v.app(), 'Journal', 'People', cold.cache);
		expect(warm.contact.get('Frederik Stray')?.lastSeen).toBe('2026-08-01');
	});

	it('re-reads only the file whose mtime moved', async () => {
		const v = vaultWithPeople();
		v.set('Journal/2026-08-01.md', '- [ ] A @owed [[Ida Haugland]]', 1);
		v.set('Journal/2026-08-02.md', '- [ ] B @owed [[Ida Haugland]]', 1);

		const first = await scanCommitments(v.app(), 'Journal', 'People', null);
		v.reads = 0;
		v.set('Journal/2026-08-02.md', '- [x] B @owed [[Ida Haugland]]', 2);

		const second = await scanCommitments(v.app(), 'Journal', 'People', first.cache);
		expect(v.reads).toBe(1);
		expect(second.commitments.find(c => c.text.startsWith('B'))!.done).toBe('2026-08-02');
	});

	it('discards a cache written by an older parser', async () => {
		const v = vaultWithPeople();
		v.set('Journal/2026-08-01.md', '- [ ] Send BOM @owed [[Ida Haugland]]');
		const stale = { version: CACHE_VERSION - 1, entries: {} };

		v.reads = 0;
		const res = await scanCommitments(v.app(), 'Journal', 'People', stale);
		expect(v.reads).toBe(1);
		expect(res.commitments).toHaveLength(1);
	});

	it('flags a cold scan as changed so it gets persisted', async () => {
		const v = vaultWithPeople();
		v.set('Journal/2026-08-01.md', '- [ ] Send BOM @owed [[Ida Haugland]]');
		const res = await scanCommitments(v.app(), 'Journal', 'People', emptyCache());
		expect(res.changed).toBe(true);
	});

	it('flags an unchanged warm scan as not needing a write', async () => {
		const v = vaultWithPeople();
		v.set('Journal/2026-08-01.md', '- [ ] Send BOM @owed [[Ida Haugland]]');
		const first = await scanCommitments(v.app(), 'Journal', 'People', null);
		const second = await scanCommitments(v.app(), 'Journal', 'People', first.cache);
		expect(second.changed).toBe(false);
	});

	it('drops a deleted note from the cache', async () => {
		const v = vaultWithPeople();
		v.set('Journal/2026-08-01.md', '- [ ] A @owed [[Ida Haugland]]');
		v.set('Journal/2026-08-02.md', '- [ ] B @owed [[Ida Haugland]]');

		const first = await scanCommitments(v.app(), 'Journal', 'People', null);
		v.files.delete('Journal/2026-08-02.md');

		const second = await scanCommitments(v.app(), 'Journal', 'People', first.cache);
		expect(Object.keys(second.cache.entries)).toEqual(['Journal/2026-08-01.md']);
		expect(second.changed).toBe(true);
		expect(second.commitments).toHaveLength(1);
	});

	it('survives a file that vanishes mid-scan', async () => {
		const v = vaultWithPeople();
		v.set('Journal/2026-08-01.md', '- [ ] A @owed [[Ida Haugland]]');
		const app = v.app();
		app.vault.getAbstractFileByPath = () => null;

		const res = await scanCommitments(app, 'Journal', 'People', null);
		expect(res.commitments).toEqual([]);
	});
});
