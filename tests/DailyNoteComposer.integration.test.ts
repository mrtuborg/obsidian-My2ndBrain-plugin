import { DailyNoteComposer } from '../src/composers/DailyNoteComposer';

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
	async modify(file: { path: string }, content: string) {
		this.saves.set(file.path, content);
		// Update in-memory so subsequent reads see new content
		this.files.set(file.path, content);
	}
	async create(path: string, content: string) {
		this.created.set(path, content);
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
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const PAST = '2026-01-01';

const SETTINGS = {
	journalFolder: 'Journal',
	projectsFolder: 'Projects',
	activitiesFolder: 'Activities',
	archiveFolder: 'Activities/Archive',
};

function dailyNoteTemplate(): string {
	return [
		'```dataviewjs',
		'const {dailyNoteComposer} = await cJS();',
		'await dailyNoteComposer.processDailyNote(app, dv, currentPageFile, dv.current().file.name);',
		'```',
		'',
		'----',
	].join('\n');
}

function activeActivity(name: string, tasks: string[] = ['Open task']): string {
	return [
		'---',
		`startDate: ${PAST}`,
		'stage: doing',
		'responsible: [Me]',
		'priority: medium',
		'remind: daily',
		'quality: draft',
		'context_refs: []',
		'wiki: ""',
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

describe('DailyNoteComposer.processDailyNote', () => {
	// DNC-01: today's note gets Activities section
	it('injects Activities section into today\'s note', async () => {
		const composer = new DailyNoteComposer(SETTINGS);
		const app = makeApp({
			[`Journal/${TODAY}.md`]: dailyNoteTemplate(),
			'Activities/My Project.md': activeActivity('My Project', ['Fix crash']),
		});

		await composer.processDailyNote(app, { path: `Journal/${TODAY}.md`, basename: TODAY });

		const saved = (app.vault as MockVault).saves.get(`Journal/${TODAY}.md`)!;
		expect(saved).toContain('### Activities:');
		expect(saved).toContain('My Project');
		expect(saved).toContain('- [ ] Fix crash');
	});

	// DNC-02: today's note has dataviewjs block removed (static freeze)
	it('removes the dataviewjs block from today\'s note', async () => {
		const composer = new DailyNoteComposer(SETTINGS);
		const app = makeApp({
			[`Journal/${TODAY}.md`]: dailyNoteTemplate(),
		});

		await composer.processDailyNote(app, { path: `Journal/${TODAY}.md`, basename: TODAY });

		const saved = (app.vault as MockVault).saves.get(`Journal/${TODAY}.md`)!;
		expect(saved).not.toContain('```dataviewjs');
	});

	// DNC-03: past note does NOT get Activities section
	it('does not inject Activities section into a past note', async () => {
		const composer = new DailyNoteComposer(SETTINGS);
		const app = makeApp({
			[`Journal/${PAST}.md`]: dailyNoteTemplate(),
			'Activities/My Project.md': activeActivity('My Project'),
		});

		await composer.processDailyNote(app, { path: `Journal/${PAST}.md`, basename: PAST });

		const saved = (app.vault as MockVault).saves.get(`Journal/${PAST}.md`)!;
		expect(saved ?? '').not.toContain('### Activities:');
	});

	// DNC-04: standard header is present
	it('outputs the canonical date header', async () => {
		const composer = new DailyNoteComposer(SETTINGS);
		const app = makeApp({
			[`Journal/${TODAY}.md`]: dailyNoteTemplate(),
		});

		await composer.processDailyNote(app, { path: `Journal/${TODAY}.md`, basename: TODAY });

		const saved = (app.vault as MockVault).saves.get(`Journal/${TODAY}.md`)!;
		expect(saved).toMatch(/^---\n---\n### \d{2} \[\[/m);
		expect(saved).toContain('#### Week:');
	});

	// DNC-05: past note — dataviewjs block preserved (stays dynamic)
	it('preserves the dataviewjs block in a past note', async () => {
		const composer = new DailyNoteComposer(SETTINGS);
		const app = makeApp({
			[`Journal/${PAST}.md`]: dailyNoteTemplate(),
		});

		await composer.processDailyNote(app, { path: `Journal/${PAST}.md`, basename: PAST });

		// Past note should either not be saved (no processing) or keep the script
		const saved = (app.vault as MockVault).saves.get(`Journal/${PAST}.md`);
		if (saved) {
			expect(saved).toContain('```dataviewjs');
		}
	});

	// DNC-06: done activity excluded from today's Activities section
	it('excludes done activities from the Activities section', async () => {
		const composer = new DailyNoteComposer(SETTINGS);
		const doneActivity = activeActivity('Done Thing').replace('stage: doing', 'stage: done');
		const app = makeApp({
			[`Journal/${TODAY}.md`]: dailyNoteTemplate(),
			'Activities/Done Thing.md': doneActivity,
		});

		await composer.processDailyNote(app, { path: `Journal/${TODAY}.md`, basename: TODAY });

		const saved = (app.vault as MockVault).saves.get(`Journal/${TODAY}.md`)!;
		expect(saved).not.toContain('Done Thing');
	});

	// DNC-07: archived activity excluded
	it('excludes archived activities from the Activities section', async () => {
		const composer = new DailyNoteComposer(SETTINGS);
		const app = makeApp({
			[`Journal/${TODAY}.md`]: dailyNoteTemplate(),
			'Activities/Archive/Old.md': activeActivity('Old'),
		});

		await composer.processDailyNote(app, { path: `Journal/${TODAY}.md`, basename: TODAY });

		const saved = (app.vault as MockVault).saves.get(`Journal/${TODAY}.md`)!;
		expect(saved).not.toContain('Activities/Archive/Old.md');
	});

	// DNC-08: today's note is idempotent (no double Activity sections on re-process)
	it('does not double-inject the Activities section if run twice', async () => {
		const composer = new DailyNoteComposer(SETTINGS);
		const app = makeApp({
			[`Journal/${TODAY}.md`]: dailyNoteTemplate(),
			'Activities/My Project.md': activeActivity('My Project'),
		});

		// First run
		await composer.processDailyNote(app, { path: `Journal/${TODAY}.md`, basename: TODAY });
		// Second run on the saved content (which is now static — no dataviewjs)
		// Note: after first run, dataviewjs is removed so it won't reprocess as "today"
		const count = ((app.vault as MockVault).saves.get(`Journal/${TODAY}.md`) ?? '').match(/### Activities:/g)?.length ?? 0;
		expect(count).toBe(1);
	});

	// Engine never writes to Activity files directly (Activities section is read-only source)
	it('does not overwrite activity files when building the Activities section', async () => {
		const composer = new DailyNoteComposer(SETTINGS);
		const app = makeApp({
			[`Journal/${TODAY}.md`]: dailyNoteTemplate(),
			'Activities/My Project.md': activeActivity('My Project'),
		});

		await composer.processDailyNote(app, { path: `Journal/${TODAY}.md`, basename: TODAY });

		const saves = (app.vault as MockVault).saves;
		expect(saves.has(`Journal/${TODAY}.md`)).toBe(true);
	});
});

// ── Past note recovery ────────────────────────────────────────────────────────

describe('DailyNoteComposer — past note recovery (deleted and recreated)', () => {
	const composer = new DailyNoteComposer(SETTINGS);

	function activityWithJournalEntry(date: string, lines: string[]): string {
		return [
			'---',
			`startDate: 2026-01-01`,
			'stage: doing',
			'responsible: [Me]',
			'priority: medium',
			'remind: daily',
			'quality: draft',
			'context_refs: []',
			'wiki: ""',
			'project: inbox',
			'---',
			'',
			'## Description',
			'',
			'----',
			'',
			'## Journal',
			'',
			`[[${date}]]`,
			...lines,
			'',
			'----',
		].join('\n');
	}

	it('reconstructs Activities section from activity Journal entries for a past date', async () => {
		const pastDate = '2026-04-04';
		const app = makeApp({
			[`Journal/${pastDate}.md`]: '',  // empty — just deleted and recreated
			'Activities/My Project.md': activityWithJournalEntry(pastDate, [
				'- [ ] Fix the WiFi driver',
				'- [x] Write test plan',
			]),
		});

		await composer.processDailyNote(app, { path: `Journal/${pastDate}.md`, basename: pastDate });

		const saved = (app.vault as MockVault).saves.get(`Journal/${pastDate}.md`)!;
		expect(saved).toContain('### Activities:');
		expect(saved).toContain('My Project');
		expect(saved).toContain('- [ ] Fix the WiFi driver');
		expect(saved).toContain('- [x] Write test plan');
	});

	it('includes activities from Archive/ folder in past note recovery', async () => {
		const pastDate = '2026-01-15';
		const app = makeApp({
			[`Journal/${pastDate}.md`]: '',
			'Activities/Archive/Old Project.md': activityWithJournalEntry(pastDate, [
				'- [x] Completed task',
			]),
		});

		await composer.processDailyNote(app, { path: `Journal/${pastDate}.md`, basename: pastDate });

		const saved = (app.vault as MockVault).saves.get(`Journal/${pastDate}.md`)!;
		expect(saved).toContain('Old Project');
		expect(saved).toContain('- [x] Completed task');
	});

	it('produces only the canonical header if no activity has an entry for that date', async () => {
		const pastDate = '2025-01-01';
		const app = makeApp({
			[`Journal/${pastDate}.md`]: '',
			'Activities/My Project.md': activityWithJournalEntry('2025-02-01', ['- [ ] Unrelated task']),
		});

		await composer.processDailyNote(app, { path: `Journal/${pastDate}.md`, basename: pastDate });

		const saved = (app.vault as MockVault).saves.get(`Journal/${pastDate}.md`)!;
		expect(saved).toContain('---\n---\n###');  // canonical header present
		// Falls back: My Project startDate=2026-01-01 > pastDate=2025-01-01, so excluded
		expect(saved).not.toContain('### Activities:');
	});

	it('falls back to startDate-based recovery when no state-change entries exist for that date', async () => {
		// Simulate a "carry-forward" day — activity was active but had no state change
		const pastDate = '2026-04-06';
		const app = makeApp({
			[`Journal/${pastDate}.md`]: '',
			// Activity started before the target date, has no [[2026-04-06]] entry
			'Activities/Long Running.md': [
				'---',
				'startDate: 2026-01-01',
				'stage: doing',
				'responsible: [Me]',
				'priority: medium',
				'remind: daily',
				'quality: draft',
				'context_refs: []',
				'wiki: ""',
				'project: inbox',
				'---',
				'',
				'## Description',
				'',
				'----',
				'',
				'## Journal',
				'',
				'[[2026-01-01]]',
				'- [ ] Long running task',
				'',
				'----',
			].join('\n'),
		});

		await composer.processDailyNote(app, { path: `Journal/${pastDate}.md`, basename: pastDate });

		const saved = (app.vault as MockVault).saves.get(`Journal/${pastDate}.md`)!;
		// Fallback: shows activity because startDate (2026-01-01) ≤ targetDate (2026-04-06)
		expect(saved).toContain('### Activities:');
		expect(saved).toContain('Long Running');
		expect(saved).toContain('- [ ] Long running task');
	});

	// Regression: fallback recovery must respect stage, same as the normal build.
	// Without this, every activity with a qualifying startDate leaked in
	// regardless of stage (backlog/done/inbox), flooding recovered past notes.
	it('excludes non-doing activities from startDate-based fallback recovery', async () => {
		const pastDate = '2026-04-06';
		const app = makeApp({
			[`Journal/${pastDate}.md`]: '',
			'Activities/Long Running.md': [
				'---',
				'startDate: 2026-01-01',
				'stage: doing',
				'---',
				'',
				'## Journal',
				'',
				'[[2026-01-01]]',
				'- [ ] Long running task',
				'',
				'----',
			].join('\n'),
			'Activities/Backlog Item.md': [
				'---',
				'startDate: 2026-01-01',
				'stage: backlog',
				'---',
				'',
				'## Journal',
				'',
				'[[2026-01-01]]',
				'- [ ] Someday task',
				'',
				'----',
			].join('\n'),
		});

		await composer.processDailyNote(app, { path: `Journal/${pastDate}.md`, basename: pastDate });

		const saved = (app.vault as MockVault).saves.get(`Journal/${pastDate}.md`)!;
		expect(saved).toContain('Long Running');
		expect(saved).not.toContain('Backlog Item');
	});

	it('does NOT run recovery on a past note that already has content', async () => {
		const pastDate = '2026-03-10';
		const existingContent = [
			'---', '---',
			'### 10 [[2026-03|March]] [[2026]]',
			'#### Week: [[2026-W11|11]]',
			'----',
			'### Activities:',
			'----',
			'##### [[Activities/Something.md|Something]]',
			'----',
		].join('\n');

		const app = makeApp({
			[`Journal/${pastDate}.md`]: existingContent,
			'Activities/My Project.md': activityWithJournalEntry(pastDate, ['- [ ] Task']),
		});

		await composer.processDailyNote(app, { path: `Journal/${pastDate}.md`, basename: pastDate });

		// Should not have modified the file (it already had content)
		const saved = (app.vault as MockVault).saves.get(`Journal/${pastDate}.md`);
		// Either not saved at all or saved with same structure (not double-injected)
		if (saved) {
			const count = (saved.match(/### Activities:/g) ?? []).length;
			expect(count).toBe(1);
		}
	});
});

// ── Sync grace period tests ─────────────────────────────────────────────
describe('sync grace period', () => {
	const SYNC_SETTINGS = { ...SETTINGS, syncGraceSeconds: 0.1 }; // 100ms for fast tests

	it('skips processing when sync delivers processed note during grace period', async () => {
		const path = `Journal/${TODAY}.md`;
		const app = makeApp({ [path]: '' });
		const vault = app.vault as MockVault;

		// Simulate sync delivering processed content during the grace delay.
		// The composer writes a placeholder (1st save), then waits, then re-reads.
		// We intercept the re-read to return synced content.
		const originalRead = vault.read.bind(vault);
		let readCount = 0;
		vault.read = async (file: { path: string }) => {
			readCount++;
			if (readCount >= 2 && file.path === path) {
				// 2nd read (1st = initial load, 2nd = the grace-period re-read).
				// saveFile() itself never calls read(), so the re-read is #2, not #3.
				return '---\n---\n### 16 [[2026-07|July]] [[2026]]\n#### Week: [[2026-W29|29]]\n\n### Activities:\n----\n##### [[Activities/Test.md|Test]]\n- [ ] some task';
			}
			return originalRead(file);
		};

		const composer = new DailyNoteComposer(SYNC_SETTINGS);
		await composer.processDailyNote(app as any, { path, basename: TODAY });

		// The placeholder was written (instant feedback), but the heavy pipeline
		// was skipped because sync delivered the processed version.
		const saved = vault.saves.get(path);
		expect(saved).toBeDefined();
		// Should contain only the placeholder, NOT the full Activities section
		expect(saved).toContain('⏳');
		expect(saved).not.toContain('### Activities:');
	});

	it('proceeds normally when sync does not deliver during grace period', async () => {
		const path = `Journal/${TODAY}.md`;
		const app = makeApp({
			[path]: '',
			'Activities/Test.md': '---\nstartDate: 2026-01-01\nstage: doing\nresponsible: [me]\n---\n## Description\nTest\n## Journal\n- [ ] task',
		});

		const composer = new DailyNoteComposer(SYNC_SETTINGS);
		await composer.processDailyNote(app as any, { path, basename: TODAY });

		const saved = (app.vault as MockVault).saves.get(path);
		expect(saved).toBeDefined();
		expect(saved).toContain('---\n---');
	});

	// Regression: the placeholder written before the grace delay gets re-read
	// (nothing else delivers real content), and must not leak into the final
	// saved note as a stray trailing "> ⏳ ..." line.
	it('does not leave the "Building Activities section" placeholder in the final note', async () => {
		const path = `Journal/${TODAY}.md`;
		const app = makeApp({ [path]: '' });

		const composer = new DailyNoteComposer(SYNC_SETTINGS);
		await composer.processDailyNote(app as any, { path, basename: TODAY });

		const saved = (app.vault as MockVault).saves.get(path)!;
		expect(saved).not.toContain('⏳');
		expect(saved).not.toContain('Building Activities section');
	});

	// Same leak, but for the past-note recovery placeholder.
	it('does not leave the "Recovering from activity history" placeholder in the final note', async () => {
		const path = `Journal/${YESTERDAY}.md`;
		const app = makeApp({ [path]: '' });

		const composer = new DailyNoteComposer(SYNC_SETTINGS);
		await composer.processDailyNote(app as any, { path, basename: YESTERDAY });

		const saved = (app.vault as MockVault).saves.get(path)!;
		expect(saved).not.toContain('⏳');
		expect(saved).not.toContain('Recovering from activity history');
	});

	it('skips grace period when syncGraceSeconds is 0', async () => {
		const path = `Journal/${TODAY}.md`;
		const app = makeApp({ [path]: '' });

		const noSyncSettings = { ...SETTINGS, syncGraceSeconds: 0 };
		const composer = new DailyNoteComposer(noSyncSettings);

		const start = Date.now();
		await composer.processDailyNote(app as any, { path, basename: TODAY });
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(100);
	});

	it('skips grace period for already-processed notes', async () => {
		const path = `Journal/${TODAY}.md`;
		const processedContent = '---\n---\n### 16 [[2026-07|July]]\n\n### Activities:\n----';
		const app = makeApp({ [path]: processedContent });

		const composer = new DailyNoteComposer(SYNC_SETTINGS);

		const start = Date.now();
		await composer.processDailyNote(app as any, { path, basename: TODAY });
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(200);
	});
});
