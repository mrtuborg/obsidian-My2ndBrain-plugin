import { FileIO } from '../src/utilities/FileIO';

const fileIO = new FileIO();

describe('FileIO.parseFrontmatterBool', () => {
	const withValue = (v: string) => `---\nstage: doing\ntakeToWork: ${v}\n---\n\nbody`;

	it('parses truthy spellings', () => {
		for (const v of ['true', 'True', 'yes', '1', '"true"']) {
			expect(fileIO.parseFrontmatterBool(withValue(v), 'takeToWork')).toBe(true);
		}
	});

	it('parses falsy spellings', () => {
		for (const v of ['false', 'FALSE', 'no', '0']) {
			expect(fileIO.parseFrontmatterBool(withValue(v), 'takeToWork')).toBe(false);
		}
	});

	it('returns null for an absent field, so callers can tell it apart from false', () => {
		expect(fileIO.parseFrontmatterBool('---\nstage: doing\n---\n', 'takeToWork')).toBeNull();
	});

	it('returns null for an unparseable value', () => {
		expect(fileIO.parseFrontmatterBool(withValue('maybe'), 'takeToWork')).toBeNull();
	});
});

describe('FileIO.upsertFrontmatterField', () => {
	const content = [
		'---',
		'startDate: 2026-01-05',
		'stage: doing',
		'responsible: [Me]',
		'project: roommate',
		'---',
		'',
		'## Description',
		'',
		'body text',
	].join('\n');

	it('replaces an existing field in place, leaving every other line untouched', () => {
		const out = fileIO.upsertFrontmatterField(content, 'stage', 'done');
		expect(out.split('\n')).toEqual(content.split('\n').map(l => l === 'stage: doing' ? 'stage: done' : l));
	});

	it('inserts a new field directly after stage', () => {
		const out = fileIO.upsertFrontmatterField(content, 'takeToWork', 'true');
		const lines = out.split('\n');
		expect(lines[2]).toBe('stage: doing');
		expect(lines[3]).toBe('takeToWork: true');
		expect(lines[4]).toBe('responsible: [Me]');
	});

	it('appends at the end of the block when the anchor key is absent', () => {
		const noStage = '---\nstartDate: 2026-01-05\n---\n\nbody';
		const out = fileIO.upsertFrontmatterField(noStage, 'takeToWork', 'false');
		expect(out).toBe('---\nstartDate: 2026-01-05\ntakeToWork: false\n---\n\nbody');
	});

	it('removes a field when the value is null', () => {
		const withDate = fileIO.upsertFrontmatterField(content, 'takeToWorkDate', '2026-09-05');
		expect(withDate).toContain('takeToWorkDate: 2026-09-05');
		const cleared = fileIO.upsertFrontmatterField(withDate, 'takeToWorkDate', null);
		expect(cleared).toBe(content);
	});

	it('is a no-op when removing a field that is not there', () => {
		expect(fileIO.upsertFrontmatterField(content, 'nope', null)).toBe(content);
	});

	it('is idempotent', () => {
		const once = fileIO.upsertFrontmatterField(content, 'takeToWork', 'true');
		expect(fileIO.upsertFrontmatterField(once, 'takeToWork', 'true')).toBe(once);
	});

	it('creates a frontmatter block for a note that has none', () => {
		const out = fileIO.upsertFrontmatterField('# Title\n\ntext', 'takeToWork', 'true');
		expect(out).toBe('---\ntakeToWork: true\n---\n\n# Title\n\ntext');
	});

	it('leaves content untouched when the frontmatter block is unterminated', () => {
		const broken = '---\nstage: doing\n\n# no closing fence';
		expect(fileIO.upsertFrontmatterField(broken, 'takeToWork', 'true')).toBe(broken);
	});

	it('does not mistake a mid-document --- for frontmatter', () => {
		const body = '# Title\n\n---\nstage: doing\n---\n';
		const out = fileIO.upsertFrontmatterField(body, 'takeToWork', 'true');
		expect(out.startsWith('---\ntakeToWork: true\n---')).toBe(true);
		expect(out).toContain('stage: doing');
	});
});

describe('FileIO.updateFrontmatterFields', () => {
	function makeApp(files: Record<string, string>) {
		const store = new Map(Object.entries(files));
		const saves: string[] = [];
		return {
			saves,
			store,
			app: {
				vault: {
					getAbstractFileByPath: (p: string) => (store.has(p) ? { path: p } : null),
					read: async (f: { path: string }) => store.get(f.path) ?? '',
					modify: async (f: { path: string }, c: string) => { store.set(f.path, c); saves.push(f.path); },
					getFiles: () => [...store.keys()].map(p => ({ path: p, name: p, basename: p })),
					create: async () => undefined,
					createFolder: async () => undefined,
				},
			} as any,
		};
	}

	it('writes several fields in one pass', async () => {
		const { app, store, saves } = makeApp({
			'Activities/a.md': '---\nstartDate: 2026-01-05\nstage: backlog\n---\n\nbody',
		});

		await fileIO.updateFrontmatterFields(app, 'Activities/a.md', {
			takeToWork: 'true',
			stage: 'doing',
		});

		const saved = store.get('Activities/a.md')!;
		expect(saved).toContain('stage: doing');
		expect(saved).toContain('takeToWork: true');
		expect(saves).toHaveLength(1);
	});

	it('does not write when nothing actually changed', async () => {
		const { app, saves } = makeApp({
			'Activities/a.md': '---\nstage: doing\ntakeToWork: true\n---\n\nbody',
		});

		await fileIO.updateFrontmatterFields(app, 'Activities/a.md', { takeToWork: 'true' });

		expect(saves).toHaveLength(0);
	});

	it('is a no-op for a missing file', async () => {
		const { app, saves } = makeApp({});
		await fileIO.updateFrontmatterFields(app, 'Activities/gone.md', { takeToWork: 'true' });
		expect(saves).toHaveLength(0);
	});
});
