import { loadProjectRecords } from '../src/utilities/ProjectIndex';

function makeApp(files: Record<string, string>) {
	const store = new Map(Object.entries(files));
	return {
		vault: {
			getAbstractFileByPath: (p: string) => (store.has(p) ? { path: p } : null),
			read: async (f: { path: string }) => store.get(f.path) ?? '',
			modify: async () => undefined,
			getFiles: () => [...store.keys()].map(p => ({
				path: p,
				name: p.split('/').pop()!,
				basename: p.split('/').pop()!.replace(/\.md$/, ''),
			})),
		},
	} as any;
}

describe('loadProjectRecords', () => {
	it('reads top-level project notes and their role', async () => {
		const app = makeApp({ 'Projects/roommate.md': '---\nrole: Engineer\n---\n' });
		expect(await loadProjectRecords(app, 'Projects')).toEqual([
			{ slug: 'roommate', path: 'Projects/roommate.md', role: 'Engineer' },
		]);
	});

	it('resolves a folder-style project to its Project.md', async () => {
		const app = makeApp({
			'Projects/pipeline/Project.md': '---\nrole: TechLead\n---\n',
			'Projects/pipeline/README.md': '# notes',
		});
		const records = await loadProjectRecords(app, 'Projects');
		expect(records).toEqual([
			{ slug: 'pipeline', path: 'Projects/pipeline/Project.md', role: 'TechLead' },
		]);
	});

	it('leaves role blank when the project has none', async () => {
		const app = makeApp({ 'Projects/orphan.md': '# no frontmatter' });
		expect((await loadProjectRecords(app, 'Projects'))[0]!.role).toBe('');
	});

	it('ignores files outside the projects folder', async () => {
		const app = makeApp({
			'Projects/real.md': '---\nrole: Family\n---\n',
			'Activities/a1.md': '---\nrole: Family\n---\n',
		});
		expect((await loadProjectRecords(app, 'Projects')).map(p => p.slug)).toEqual(['real']);
	});

	it('keeps only the first record for a duplicated slug', async () => {
		const app = makeApp({
			'Projects/dup.md': '---\nrole: Engineer\n---\n',
			'Projects/dup/Project.md': '---\nrole: Family\n---\n',
		});
		const records = await loadProjectRecords(app, 'Projects');
		expect(records).toHaveLength(1);
		expect(records[0]!.role).toBe('Engineer');
	});
});
