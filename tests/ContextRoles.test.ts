import { ActivitiesInProgress } from '../src/components/ActivitiesInProgress';
import { AutoActivityCreator } from '../src/components/AutoActivityCreator';
import { DailyNoteComposer } from '../src/composers/DailyNoteComposer';
import { ContextPageComposer } from '../src/composers/ContextPageComposer';

const TODAY = new Date().toISOString().slice(0, 10);
const NESTED_DIR = 'Journal/2026/08.August';
const DAILY = `${NESTED_DIR}/${TODAY}.md`;
const CTX_ENGINEER = `${NESTED_DIR}/Contexts/${TODAY}-Engineer.md`;

const SETTINGS = {
	journalFolder: 'Journal',
	projectsFolder: 'Projects',
	activitiesFolder: 'Activities',
	archiveFolder: 'Activities/Archive',
};

function makeFile(path: string) {
	return { path, name: path.split('/').pop()!, basename: path.split('/').pop()!.replace(/\.md$/, '') };
}

function makeApp(files: Record<string, string>) {
	const fileMap = new Map(Object.entries(files));
	const saves = new Map<string, string>();
	return {
		_files: fileMap,
		_saves: saves,
		vault: {
			getFiles: () => [...fileMap.keys()].map(makeFile),
			getAbstractFileByPath: (p: string) => fileMap.has(p) ? makeFile(p) : null,
			read: async (f: { path: string }) => fileMap.get(f.path) ?? '',
			modify: async (f: { path: string }, c: string) => { saves.set(f.path, c); fileMap.set(f.path, c); },
			create: async (p: string, c: string) => { fileMap.set(p, c); saves.set(p, c); return makeFile(p); },
			createFolder: async () => {},
		},
	} as any;
}

function activity(opts: { role?: string; type?: string; todos?: string[] } = {}): string {
	return [
		'---',
		'startDate: 2026-01-01',
		'stage: doing',
		'responsible: [Me]',
		'priority: medium',
		'remind: daily',
		'project: inbox',
		...(opts.type ? [`type: ${opts.type}`] : []),
		...(opts.role !== undefined ? [`role: ${opts.role}`] : []),
		'---',
		'',
		'## Description',
		'',
		'----',
		'',
		'## Journal',
		'',
		...(opts.todos ?? ['Open task']).map(t => `- [ ] ${t}`),
		'',
		'----',
	].join('\n');
}

function project(role: string, activityName: string): string {
	return ['---', `role: ${role}`, '---', `##### [[Activities/${activityName}.md|${activityName}]]`, 'desc'].join('\n');
}

const BASE = {
	'Activities/Plain.md': activity({ todos: ['plain todo'] }),
	'Activities/Eng Own.md': activity({ role: 'Engineer', todos: ['eng todo'] }),
	'Activities/Legacy.md': activity({ todos: ['legacy todo'] }),
	'Projects/Legacy Project.md': project('Family', 'Legacy'),
	'Activities/Plan for Today.md': activity({ type: 'inbox', role: 'Engineer', todos: ['inbox todo'] }),
};

describe('ActivitiesInProgress roles', () => {
	const ip = new ActivitiesInProgress(SETTINGS);

	it('daily note keeps only unrolled activities (inbox type always stays)', async () => {
		const out = await ip.run(makeApp(BASE), '');
		expect(out).toContain('Activities/Plain.md');
		expect(out).toContain('Activities/Plan for Today.md');
		expect(out).not.toContain('Eng Own');
		expect(out).not.toContain('Legacy.md');
	});

	it('unknown role (own or via project) stays unrolled; only ROLES are rollable', async () => {
		const app = makeApp({
			'Activities/Typo.md': activity({ role: 'Engeneer', todos: ['typo todo'] }),
			'Activities/ViaProject.md': activity({ todos: ['pp todo'] }),
			'Projects/Bad Project.md': project('Wizard', 'ViaProject'),
		});
		const out = await ip.run(app, '');
		expect(out).toContain('Activities/Typo.md');
		expect(out).toContain('Activities/ViaProject.md');
		expect([...(await ip.rolesWithActivities(app))]).toEqual([]);
	});

	it('run merges blocks already written in the existing page content', async () => {
		const existing = '----\n##### [[Activities/Plain.md|Plain]]\n- [x] done by hand\n----';
		const out = await ip.run(makeApp(BASE), existing);
		expect(out).toContain('- [x] done by hand');
		expect(out).toContain('- [ ] plain todo');
		expect(out.match(/Activities\/Plain\.md/g)).toHaveLength(1);
	});

	it('activity role wins; linked project role is the fallback', async () => {
		const app = makeApp(BASE);
		const eng = await ip.runForRole(app, 'Engineer');
		expect(eng).toContain('Eng Own');
		expect(eng).not.toContain('Plan for Today');
		expect(eng).not.toContain('Legacy');

		const fam = await ip.runForRole(app, 'Family');
		expect(fam).toContain('Legacy');
		expect(fam).not.toContain('Eng Own');
	});

	it('activity role overrides a conflicting project role', async () => {
		const app = makeApp({
			'Activities/X.md': activity({ role: 'Selfcare' }),
			'Projects/P.md': project('Family', 'X'),
		});
		expect(await ip.runForRole(app, 'Selfcare')).toContain('Activities/X.md');
		expect(await ip.runForRole(app, 'Family')).toBe('');
	});

	it('rolesWithActivities reports only roles with eligible activities', async () => {
		const roles = await ip.rolesWithActivities(makeApp(BASE));
		expect([...roles].sort()).toEqual(['Engineer', 'Family']);
	});

	it('runForRole keeps what is already written and appends new todos', async () => {
		const app = makeApp(BASE);
		const existing = [
			'----',
			'##### [[Activities/Eng Own.md|Eng Own]]',
			'- [x] already done here',
			'----',
		].join('\n');
		const out = await ip.runForRole(app, 'Engineer', existing);
		expect(out).toContain('- [x] already done here');
		expect(out).toContain('- [ ] eng todo');
		expect(out.match(/##### \[\[Activities\/Eng Own\.md/g)).toHaveLength(1);
	});
});

describe('AutoActivityCreator role', () => {
	it('writes role into new activity frontmatter (blank by default)', async () => {
		const creator = new AutoActivityCreator();
		const app = makeApp({});
		await creator.createMissingFromContent(app, '[[Alpha]]', TODAY, 'inbox', 'Family');
		await creator.createMissingFromContent(app, '[[Beta]]', TODAY, 'inbox');
		expect(app._files.get('Activities/Alpha.md')).toContain('\nrole: Family\n');
		expect(app._files.get('Activities/Beta.md')).toMatch(/\nrole: \n/);
	});
});

describe('DailyNoteComposer + Contexts', () => {
	it('lists only unrolled activities and links existing context pages (nested path, idempotent)', async () => {
		const app = makeApp({ ...BASE, [DAILY]: '', [CTX_ENGINEER]: '' });
		const composer = new DailyNoteComposer(SETTINGS);
		await composer.processDailyNote(app, { path: DAILY, basename: TODAY });

		const saved = app._saves.get(DAILY)!;
		expect(saved).toContain('Activities/Plain.md');
		expect(saved).not.toContain('Eng Own');
		expect(saved).toContain(`[[${NESTED_DIR}/Contexts/${TODAY}-Engineer|Engineer]]`);
		expect(saved.match(/🧭 Contexts:/g)).toHaveLength(1);

		// A competing daily note must never be created.
		expect([...app._files.keys()].filter(p => p.endsWith(`/${TODAY}.md`))).toEqual([DAILY]);

		// Activity processing during the build must not drop the role field.
		expect(app._files.get('Activities/Eng Own.md')).toContain('role: Engineer');
	});

	it('ensureContextLink adds the link to an already-built note without duplicating', async () => {
		const composer = new DailyNoteComposer(SETTINGS);
		// Build without the context page present, then add it afterwards.
		const without = makeApp({ ...BASE, [DAILY]: '' });
		await composer.processDailyNote(without, { path: DAILY, basename: TODAY });
		expect(without._saves.get(DAILY)).not.toContain('🧭 Contexts:');

		without._files.set(CTX_ENGINEER, '');
		await composer.ensureContextLink(without, { path: DAILY, basename: TODAY }, 'Engineer');
		await composer.ensureContextLink(without, { path: DAILY, basename: TODAY }, 'Engineer');
		const after = without._files.get(DAILY)!;
		expect(after.match(/🧭 Contexts:/g)).toHaveLength(1);
		expect(after).toContain('Activities/Plain.md');
	});

	it('stamps the hidden marker when every activity is rolled, and is frozen on re-run', async () => {
		const app = makeApp({
			'Activities/Eng Own.md': activity({ role: 'Engineer', todos: ['eng todo'] }),
			[DAILY]: '',
		});
		const composer = new DailyNoteComposer(SETTINGS);
		await composer.processDailyNote(app, { path: DAILY, basename: TODAY });
		const first = app._files.get(DAILY)!;
		expect(first).toContain('<!-- 2ndbrain:activities-built -->');
		expect(first).not.toContain('Eng Own');

		app._saves.clear();
		await composer.processDailyNote(app, { path: DAILY, basename: TODAY });
		expect(app._saves.has(DAILY)).toBe(false);
		expect(app._files.get(DAILY)).toBe(first);
	});

	it('stamps the marker when there are no eligible activities at all', async () => {
		const app = makeApp({ [DAILY]: '' });
		await new DailyNoteComposer(SETTINGS).processDailyNote(app, { path: DAILY, basename: TODAY });
		expect(app._files.get(DAILY)).toContain('<!-- 2ndbrain:activities-built -->');
	});

	it('treats a legacy visible "### Activities:" note as already processed', async () => {
		const legacy = '---\n---\n### x\n\n### Activities:\n----';
		const app = makeApp({ ...BASE, [DAILY]: legacy });
		await new DailyNoteComposer(SETTINGS).processDailyNote(app, { path: DAILY, basename: TODAY });
		expect(app._saves.has(DAILY)).toBe(false);
	});

	it('sync grace recognises the marker delivered by sync', async () => {
		const processed = '---\n---\n### x\n\n----\n\n<!-- 2ndbrain:activities-built -->\n----';
		const app = makeApp({ ...BASE, [DAILY]: '' });
		let reads = 0;
		const origRead = app.vault.read;
		app.vault.read = async (f: any) => (f.path === DAILY && ++reads >= 2 ? processed : origRead(f));
		const composer = new DailyNoteComposer({ ...SETTINGS, syncGraceSeconds: 0.01 } as any);
		await composer.processDailyNote(app, { path: DAILY, basename: TODAY });
		expect(app._files.get(DAILY)).not.toContain('Activities/Plain.md');
		expect(app._files.get(DAILY)).not.toContain('🧭');
	});

	it('forced rebuild keeps written blocks and does not duplicate the originals', async () => {
		const written = [
			'---', '---', '### x', '',
			'##### [[Activities/Plain.md|Plain]]',
			'- [x] hand-written entry',
			'----',
			'my own notes',
		].join('\n');
		const app = makeApp({ ...BASE, [DAILY]: written });
		await new DailyNoteComposer(SETTINGS).processDailyNote(app, { path: DAILY, basename: TODAY });
		const out = app._files.get(DAILY)!;
		expect(out).toContain('- [x] hand-written entry');
		expect(out).toContain('- [ ] plain todo');
		expect(out).toContain('my own notes');
		expect(out.match(/\[\[Activities\/Plain\.md\|Plain\]\]/g)).toHaveLength(1);
		expect(out.match(/activities-built/g)).toHaveLength(1);
	});

	it('rolesToPrebuild only returns roles that have eligible activities', async () => {
		const composer = new DailyNoteComposer(SETTINGS);
		const roles = await composer.rolesToPrebuild(makeApp(BASE));
		expect([...roles].sort()).toEqual(['Engineer', 'Family']);
	});

	it('does not echo the context page backlink into the daily note as a mention', async () => {
		const app = makeApp({
			...BASE,
			[DAILY]: '',
			[CTX_ENGINEER]: `# Engineer\n\n[[${DAILY}|← Daily Note]]\n\n[[${TODAY}]] backlink`,
		});
		await new DailyNoteComposer(SETTINGS).processDailyNote(app, { path: DAILY, basename: TODAY });
		expect(app._saves.get(DAILY)).not.toContain('backlink');
	});
});

describe('ContextPageComposer', () => {
	it('scaffolds a blank page with only that role\'s activities and a back link', async () => {
		const app = makeApp({ ...BASE, [CTX_ENGINEER]: '' });
		await new ContextPageComposer(SETTINGS).processContextPage(app, { path: CTX_ENGINEER }, 'Engineer');

		const saved = app._saves.get(CTX_ENGINEER)!;
		expect(saved).toContain('## Activities');
		expect(saved).toContain('## Notes');
		expect(saved).toContain(`[[${DAILY}|← Daily Note]]`);
		expect(saved).toContain('Eng Own');
		expect(saved).toContain('eng todo');
		expect(saved).not.toContain('Plain.md');
		expect(saved).not.toContain('Legacy');
	});

	it('is idempotent and never touches the Notes area', async () => {
		const app = makeApp({ ...BASE, [CTX_ENGINEER]: '' });
		const composer = new ContextPageComposer(SETTINGS);
		await composer.processContextPage(app, { path: CTX_ENGINEER }, 'Engineer');
		const first = app._files.get(CTX_ENGINEER)!;
		app._files.set(CTX_ENGINEER, first + 'my own note\n');
		await composer.processContextPage(app, { path: CTX_ENGINEER }, 'Engineer');
		const second = app._files.get(CTX_ENGINEER)!;
		expect(second).toContain('my own note');
		expect(second.match(/##### \[\[Activities\/Eng Own\.md/g)).toHaveLength(1);
	});

	it('ignores past context pages', async () => {
		const past = `${NESTED_DIR}/Contexts/2026-01-01-Engineer.md`;
		const app = makeApp({ ...BASE, [past]: '' });
		await new ContextPageComposer(SETTINGS).processContextPage(app, { path: past }, 'Engineer');
		expect(app._saves.has(past)).toBe(false);
	});

	it('tags an activity created from a wikilink typed on the page with that role', async () => {
		const page = ['# Engineer', '', '## Activities', '', '[[Brand New Thing]]', '', '## Notes', ''].join('\n');
		const app = makeApp({ ...BASE, [CTX_ENGINEER]: page });
		await new ContextPageComposer(SETTINGS).processContextPage(app, { path: CTX_ENGINEER }, 'Engineer');
		expect(app._files.get('Activities/Brand New Thing.md')).toContain('\nrole: Engineer\n');
	});
});
