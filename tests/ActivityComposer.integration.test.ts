import { ActivityComposer } from '../src/composers/ActivityComposer';

// ── Shared mock vault ────────────────────────────────────────────────

class MockVault {
	private files: Map<string, string>;
	saves: Map<string, string> = new Map();
	created: Map<string, string> = new Map();

	constructor(files: Record<string, string>) {
		this.files = new Map(Object.entries(files));
	}

	getAbstractFileByPath(path: string) {
		return this.files.has(path) ? { path } : null;
	}
	async read(file: { path: string }) { return this.files.get(file.path) ?? ''; }
	async modify(file: { path: string }, content: string) { this.saves.set(file.path, content); }
	async create(path: string, content: string) { this.created.set(path, content); return { path }; }
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

// ── Fixtures ─────────────────────────────────────────────────────────

const ACTIVITY_PATH = 'Activities/My Project.md';

function activityContent(opts: {
	stage?: string;
	startDate?: string;
	priority?: string;
	extraFields?: string;
	journalBody?: string;
}): string {
	const {
		stage = 'doing',
		startDate = '2026-01-01',
		priority = 'medium',
		extraFields = '',
		journalBody = '',
	} = opts;

	return [
		'---',
		`startDate: ${startDate}`,
		`stage: ${stage}`,
		'responsible: [Me]',
		`priority: ${priority}`,
		'remind: weekdays',
		'quality: draft',
		'context_refs: []',
		'wiki: ""',
		'project: inbox',
		...(extraFields ? [extraFields] : []),
		'---',
		'',
		'```dataviewjs',
		'const {activityComposer} = await cJS();',
		'await activityComposer.processActivity(app, dv, currentPageFile);',
		'```',
		'',
		'## Description',
		'',
		'----',
		'',
		'## Journal',
		'',
		...(journalBody ? [journalBody] : []),
		'----',
	].join('\n');
}

function journalContent(activityName: string, tasks: string[]): string {
	return [
		'---',
		'---',
		`### 04 [[2026-04|April]] [[2026]]`,
		'',
		'----',
		'',
		`##### [[Activities/${activityName}.md|${activityName}]]`,
		...tasks,
		'----',
	].join('\n');
}

function projectContent(activityName: string, goal: string): string {
	return [
		`##### [[Activities/${activityName}.md|${activityName}]]`,
		`**Goal:** ${goal}`,
		'**Done when:**',
		'- [ ] All tests pass',
		'----',
	].join('\n');
}

const SETTINGS = {
	journalFolder: 'Journal',
	projectsFolder: 'Projects',
	activitiesFolder: 'Activities',
	archiveFolder: 'Activities/Archive',
};

// ── Tests ─────────────────────────────────────────────────────────────

describe('ActivityComposer.processActivity', () => {
	// AC-01: frontmatter standard fields preserved
	it('preserves startDate after processing', async () => {
		const composer = new ActivityComposer(SETTINGS);
		const app = makeApp({
			[ACTIVITY_PATH]: activityContent({ startDate: '2025-06-01' }),
		});

		await composer.processActivity(app, { path: ACTIVITY_PATH });

		const saved = (app.vault as MockVault).saves.get(ACTIVITY_PATH)!;
		expect(saved).toContain('startDate: 2025-06-01');
	});

	// AC-02: new journal mention is added
	it('adds a new journal date-section from a matching journal entry', async () => {
		const composer = new ActivityComposer(SETTINGS);
		const app = makeApp({
			[ACTIVITY_PATH]: activityContent({}),
			'Journal/2026-04-04.md': journalContent('My Project', ['- [ ] Fix the crash']),
		});

		await composer.processActivity(app, { path: ACTIVITY_PATH });

		const saved = (app.vault as MockVault).saves.get(ACTIVITY_PATH)!;
		expect(saved).toContain('[[2026-04-04]]');
		expect(saved).toContain('- [ ] Fix the crash');
	});

	// AC-03: existing content not duplicated
	it('does not duplicate an existing date-section on second run', async () => {
		const composer = new ActivityComposer(SETTINGS);
		const existing = activityContent({
			journalBody: '[[2026-04-04]]\n- [ ] Fix the crash\n',
		});
		const app = makeApp({
			[ACTIVITY_PATH]: existing,
			'Journal/2026-04-04.md': journalContent('My Project', ['- [ ] Fix the crash']),
		});

		await composer.processActivity(app, { path: ACTIVITY_PATH });

		const saved = (app.vault as MockVault).saves.get(ACTIVITY_PATH)!;
		const count = (saved.match(/\[\[2026-04-04\]\]/g) ?? []).length;
		expect(count).toBe(1);
	});

	// AC-04: dataviewjs block preserved
	it('preserves the dataviewjs block in output', async () => {
		const composer = new ActivityComposer(SETTINGS);
		const app = makeApp({
			[ACTIVITY_PATH]: activityContent({}),
		});

		await composer.processActivity(app, { path: ACTIVITY_PATH });

		const saved = (app.vault as MockVault).saves.get(ACTIVITY_PATH)!;
		expect(saved).toContain('```dataviewjs');
	});

	// AC-05: extra frontmatter fields preserved unchanged (invariant A.1.6)
	it('preserves extra frontmatter fields (priority, remind, quality, etc.)', async () => {
		const composer = new ActivityComposer(SETTINGS);
		const app = makeApp({
			[ACTIVITY_PATH]: activityContent({ priority: 'high' }),
		});

		await composer.processActivity(app, { path: ACTIVITY_PATH });

		const saved = (app.vault as MockVault).saves.get(ACTIVITY_PATH)!;
		expect(saved).toContain('priority: high');
		expect(saved).toContain('remind: weekdays');
		expect(saved).toContain('quality: draft');
		expect(saved).toContain('wiki: ""');
	});

	// AC-06: ## Description populated from Projects/
	it('populates ## Description from project file', async () => {
		const composer = new ActivityComposer(SETTINGS);
		const app = makeApp({
			[ACTIVITY_PATH]: activityContent({}),
			'Projects/Platform.md': projectContent('My Project', 'Fix WiFi crash'),
		});

		await composer.processActivity(app, { path: ACTIVITY_PATH });

		const saved = (app.vault as MockVault).saves.get(ACTIVITY_PATH)!;
		expect(saved).toContain('Fix WiFi crash');
		expect(saved).toContain('All tests pass');
	});

	// AC-07: ## Journal sections in chronological order
	it('orders journal sections oldest-first', async () => {
		const composer = new ActivityComposer(SETTINGS);
		const app = makeApp({
			[ACTIVITY_PATH]: activityContent({}),
			'Journal/2026-04-10.md': journalContent('My Project', ['- [ ] Later task']),
			'Journal/2026-04-04.md': journalContent('My Project', ['- [ ] Earlier task']),
		});

		await composer.processActivity(app, { path: ACTIVITY_PATH });

		const saved = (app.vault as MockVault).saves.get(ACTIVITY_PATH)!;
		const april4 = saved.indexOf('[[2026-04-04]]');
		const april10 = saved.indexOf('[[2026-04-10]]');
		expect(april4).toBeLessThan(april10);
	});

	// AC-08: [x] in journal → [x] in ## Journal (checkbox sync)
	it('synchronizes done checkboxes from journal into activity', async () => {
		const composer = new ActivityComposer(SETTINGS);
		const existing = activityContent({
			journalBody: '[[2026-04-04]]\n- [ ] Write report\n',
		});
		const app = makeApp({
			[ACTIVITY_PATH]: existing,
			'Journal/2026-04-04.md': journalContent('My Project', ['- [x] Write report']),
		});

		await composer.processActivity(app, { path: ACTIVITY_PATH });

		const saved = (app.vault as MockVault).saves.get(ACTIVITY_PATH)!;
		expect(saved).toContain('- [x] Write report');
		expect(saved).not.toMatch(/- \[ \] Write report/);
	});

	// AC-09: stage=done activity is still processed (composer always runs)
	it('still processes and saves a done-stage activity', async () => {
		const composer = new ActivityComposer(SETTINGS);
		const app = makeApp({
			[ACTIVITY_PATH]: activityContent({ stage: 'done' }),
		});

		await composer.processActivity(app, { path: ACTIVITY_PATH });

		const saved = (app.vault as MockVault).saves.get(ACTIVITY_PATH)!;
		expect(saved).toContain('stage: done');
	});

	// Engine never writes to Journal files (invariant A.1.4)
	it('does not modify any journal files', async () => {
		const composer = new ActivityComposer(SETTINGS);
		const app = makeApp({
			[ACTIVITY_PATH]: activityContent({}),
			'Journal/2026-04-04.md': journalContent('My Project', ['- [ ] Task']),
		});

		await composer.processActivity(app, { path: ACTIVITY_PATH });

		const saves = (app.vault as MockVault).saves;
		expect(saves.has('Journal/2026-04-04.md')).toBe(false);
	});

	// Engine never writes to Project files (invariant A.1.5)
	it('does not modify any project files', async () => {
		const composer = new ActivityComposer(SETTINGS);
		const app = makeApp({
			[ACTIVITY_PATH]: activityContent({}),
			'Projects/Platform.md': projectContent('My Project', 'Fix crash'),
		});

		await composer.processActivity(app, { path: ACTIVITY_PATH });

		const saves = (app.vault as MockVault).saves;
		expect(saves.has('Projects/Platform.md')).toBe(false);
	});
});
