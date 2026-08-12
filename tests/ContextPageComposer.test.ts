import { ContextPageComposer } from '../src/composers/ContextPageComposer';

class MockVault {
	private files: Map<string, string>;
	saves: Map<string, string> = new Map();

	constructor(files: Record<string, string>) {
		this.files = new Map(Object.entries(files));
	}

	getAbstractFileByPath(path: string) {
		return this.files.has(path) ? { path } : null;
	}
	async read(file: { path: string }) { return this.files.get(file.path) ?? ''; }
	async modify(file: { path: string }, content: string) {
		this.saves.set(file.path, content);
		this.files.set(file.path, content);
	}
	async create(path: string, content: string) {
		this.files.set(path, content);
		return { path };
	}
	async createFolder(_path: string) {}
	getFiles() {
		return [...this.files.keys()].map(p => ({
			path: p,
			name: p.split('/').pop()!,
			basename: p.split('/').pop()!.replace('.md', ''),
		}));
	}
}

function makeApp(files: Record<string, string>) {
	return { vault: new MockVault(files) as any };
}

const TODAY = new Date().toISOString().slice(0, 10);
const PAST = '2026-01-01';

const SETTINGS = {
	journalFolder: 'Journal',
	projectsFolder: 'Projects',
	activitiesFolder: 'Activities',
	archiveFolder: 'Activities/Archive',
};

function activeActivity(tasks: string[] = ['Open task']): string {
	return [
		'---',
		`startDate: ${PAST}`,
		'stage: doing',
		'responsible: [Me]',
		'priority: medium',
		'remind: daily',
		'project: inbox',
		'---',
		'',
		'## Description',
		'',
		'----',
		'',
		'## Journal',
		'',
		...tasks.map(t => `- [ ] ${t}`),
		'',
		'----',
	].join('\n');
}

function engineerProject(tagId: string): string {
	return [
		'---',
		'role: Engineer',
		'---',
		`##### [[Activities/${tagId}.md|${tagId}]]`,
		'Some description',
	].join('\n');
}

describe('ContextPageComposer.processContextPage', () => {
	it('scaffolds a blank context page with an Activities section', async () => {
		const composer = new ContextPageComposer(SETTINGS);
		const app = makeApp({
			[`Journal/Contexts/${TODAY}-Engineer.md`]: '',
			'Activities/My Project.md': activeActivity(['Fix bug']),
			'Projects/Widget.md': engineerProject('My Project'),
		});

		await composer.processContextPage(app, { path: `Journal/Contexts/${TODAY}-Engineer.md` }, 'Engineer');

		const saved = (app.vault as MockVault).saves.get(`Journal/Contexts/${TODAY}-Engineer.md`)!;
		expect(saved).toContain('## Activities');
		expect(saved).toContain('## Notes');
		expect(saved).toContain('My Project');
		expect(saved).toContain('Fix bug');
	});

	it('only includes activities linked to a project with the matching role', async () => {
		const composer = new ContextPageComposer(SETTINGS);
		const app = makeApp({
			[`Journal/Contexts/${TODAY}-Engineer.md`]: '',
			'Activities/Engineer Task.md': activeActivity(['Deploy']),
			'Projects/Eng Widget.md': engineerProject('Engineer Task'),
			'Activities/Family Task.md': activeActivity(['Plan trip']),
			'Projects/Family Widget.md': [
				'---',
				'role: Family',
				'---',
				'##### [[Activities/Family Task.md|Family Task]]',
				'desc',
			].join('\n'),
		});

		await composer.processContextPage(app, { path: `Journal/Contexts/${TODAY}-Engineer.md` }, 'Engineer');

		const saved = (app.vault as MockVault).saves.get(`Journal/Contexts/${TODAY}-Engineer.md`)!;
		expect(saved).toContain('Engineer Task');
		expect(saved).not.toContain('Family Task');
	});

	it('preserves freeform ## Notes content across regeneration', async () => {
		const composer = new ContextPageComposer(SETTINGS);
		const existing = [
			'# Engineer — ' + TODAY,
			'',
			'## Activities',
			'',
			'(stale content)',
			'',
			'## Notes',
			'',
			'My private musings that must never be touched.',
		].join('\n');

		const app = makeApp({
			[`Journal/Contexts/${TODAY}-Engineer.md`]: existing,
			'Activities/My Project.md': activeActivity(['Fix bug']),
			'Projects/Widget.md': engineerProject('My Project'),
		});

		await composer.processContextPage(app, { path: `Journal/Contexts/${TODAY}-Engineer.md` }, 'Engineer');

		const saved = (app.vault as MockVault).saves.get(`Journal/Contexts/${TODAY}-Engineer.md`)!;
		expect(saved).not.toContain('(stale content)');
		expect(saved).toContain('My private musings that must never be touched.');
		expect(saved).toContain('Fix bug');
	});

	it('does not regenerate a past context page', async () => {
		const composer = new ContextPageComposer(SETTINGS);
		const app = makeApp({
			[`Journal/Contexts/${PAST}-Engineer.md`]: '# Engineer — ' + PAST + '\n\n## Activities\n\nfrozen\n\n## Notes\n',
			'Activities/My Project.md': activeActivity(['Fix bug']),
			'Projects/Widget.md': engineerProject('My Project'),
		});

		await composer.processContextPage(app, { path: `Journal/Contexts/${PAST}-Engineer.md` }, 'Engineer');

		expect((app.vault as MockVault).saves.has(`Journal/Contexts/${PAST}-Engineer.md`)).toBe(false);
	});

	it('syncs a newly-typed todo into the activity file before regenerating', async () => {
		const composer = new ContextPageComposer(SETTINGS);
		const existing = [
			'# Engineer — ' + TODAY,
			'',
			'## Activities',
			'',
			'----',
			'',
			'### Activities:',
			'----',
			'##### [[Activities/My Project.md|My Project]]',
			'- [ ] Existing task',
			'----',
			'',
			'## Notes',
			'',
			'##### [[Activities/My Project.md|My Project]]',
			'- [ ] Brand new todo typed here today',
		].join('\n');

		const app = makeApp({
			[`Journal/Contexts/${TODAY}-Engineer.md`]: existing,
			'Activities/My Project.md': activeActivity(['Existing task']),
			'Projects/Widget.md': engineerProject('My Project'),
		});

		await composer.processContextPage(app, { path: `Journal/Contexts/${TODAY}-Engineer.md` }, 'Engineer');

		const activitySaved = (app.vault as MockVault).saves.get('Activities/My Project.md')!;
		expect(activitySaved).toContain('Brand new todo typed here today');

		const pageSaved = (app.vault as MockVault).saves.get(`Journal/Contexts/${TODAY}-Engineer.md`)!;
		// The freshly-generated Activities section should now reflect the synced todo too
		expect(pageSaved).toContain('Brand new todo typed here today');
	});

	it('merges todos from the real daily note and a Context page into the activity, sorted chronologically', async () => {
		// Regression test for the flat Contexts/YYYY-MM-DD-<Role>.md rename:
		// extractDateKey() must still pull a clean date out of both a real
		// daily note's basename ("2026-01-05") and a Context page's
		// date-prefixed basename ("2026-08-12-Engineer"), so todos typed in
		// either source land in the activity's Journal on the right date and
		// in the right chronological order.
		const composer = new ContextPageComposer(SETTINGS);
		const EARLIER = '2026-01-05';

		const app = makeApp({
			[`Journal/${EARLIER}.md`]:
				'##### [[Activities/My Project.md|My Project]]\n- [ ] Older task from the real daily note',
			[`Journal/Contexts/${TODAY}-Engineer.md`]:
				'# Engineer — ' + TODAY + '\n\n## Activities\n\n## Notes\n\n' +
				'##### [[Activities/My Project.md|My Project]]\n- [ ] Newer task typed in the context page',
			'Activities/My Project.md': activeActivity([]),
			'Projects/Widget.md': engineerProject('My Project'),
		});

		await composer.processContextPage(app, { path: `Journal/Contexts/${TODAY}-Engineer.md` }, 'Engineer');

		const activitySaved = (app.vault as MockVault).saves.get('Activities/My Project.md')!;
		expect(activitySaved).toContain('Older task from the real daily note');
		expect(activitySaved).toContain('Newer task typed in the context page');

		// Chronological order: the earlier real-daily-note date must appear
		// (and its todo) before the later context-page date in the Journal.
		const earlierIdx = activitySaved.indexOf(`[[${EARLIER}]]`);
		const todayIdx = activitySaved.indexOf(`[[${TODAY}]]`);
		expect(earlierIdx).toBeGreaterThan(-1);
		expect(todayIdx).toBeGreaterThan(-1);
		expect(earlierIdx).toBeLessThan(todayIdx);
	});
});
