/**
 * Phase 6 — Settings wired through all components.
 *
 * Verifies that configurable folder paths actually flow from settings
 * into each component that scans the vault, not hardcoded defaults.
 */

import { ActivitiesInProgress } from '../src/components/ActivitiesInProgress';
import { TodoSyncManager } from '../src/components/TodoSyncManager';
import { DailyNoteComposer } from '../src/composers/DailyNoteComposer';

const TODAY = new Date().toISOString().slice(0, 10);

function makeFile(path: string) {
	const basename = path.split('/').pop()!.replace('.md', '');
	return { path, name: path.split('/').pop()!, basename };
}

function makeApp(files: Record<string, string>) {
	const fileMap = new Map(Object.entries(files));
	const saves = new Map<string, string>();
	return {
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

function activeActivity(folder = 'Activities'): string {
	return [
		'---',
		`startDate: 2026-01-01`,
		'stage: active',
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
		'- [ ] Task from custom folder',
		'',
		'----',
	].join('\n');
}

// ── ActivitiesInProgress ─────────────────────────────────────────────

describe('Settings: ActivitiesInProgress uses configured activitiesFolder', () => {
	it('scans the custom activities folder, not the default "Activities"', async () => {
		const aip = new ActivitiesInProgress({
			activitiesFolder: 'Tasks',
			archiveFolder: 'Tasks/Archive',
		});

		const app = makeApp({
			'Tasks/my-task.md': activeActivity('Tasks'),
			// Deliberately also put a file under the default "Activities/" — should be ignored
			'Activities/ignored.md': activeActivity(),
		});

		const result = await aip.run(app, '');
		expect(result).toContain('my-task');
		expect(result).not.toContain('ignored');
	});

	it('respects custom archiveFolder — files there are excluded', async () => {
		const aip = new ActivitiesInProgress({
			activitiesFolder: 'Tasks',
			archiveFolder: 'Tasks/Done',
		});

		const app = makeApp({
			'Tasks/active.md': activeActivity('Tasks'),
			'Tasks/Done/old.md': activeActivity('Tasks'),
		});

		const result = await aip.run(app, '');
		expect(result).toContain('active');
		expect(result).not.toContain('Tasks/Done/old.md');
	});
});

// ── TodoSyncManager ──────────────────────────────────────────────────

describe('Settings: TodoSyncManager uses configured activitiesFolder', () => {
	it('processes files in the custom folder and ignores the default folder', async () => {
		const mockProcess = jest.fn().mockResolvedValue(undefined);
		const tsm = new TodoSyncManager(mockProcess, {
			activitiesFolder: 'Tasks',
			archiveFolder: 'Tasks/Archive',
		});

		const app = makeApp({
			'Tasks/active.md': activeActivity('Tasks'),
			'Activities/default.md': activeActivity(),  // should be ignored
		});

		await tsm.run(app);
		expect(mockProcess).toHaveBeenCalledTimes(1);
		expect(mockProcess.mock.calls[0][1].path).toBe('Tasks/active.md');
	});
});

// ── DailyNoteComposer — settings flow end to end ─────────────────────

describe('Settings: DailyNoteComposer passes folder settings to sub-components', () => {
	it('builds Activities section from a custom activitiesFolder', async () => {
		const composer = new DailyNoteComposer({
			journalFolder: 'Notes',
			projectsFolder: 'Work',
			activitiesFolder: 'Tasks',
			archiveFolder: 'Tasks/Archive',
		});

		const app = makeApp({
			[`Notes/${TODAY}.md`]: [
				'```dataviewjs',
				'const x = 1;',
				'```',
				'----',
			].join('\n'),
			'Tasks/my-task.md': activeActivity('Tasks'),
		});

		await composer.processDailyNote(app, { path: `Notes/${TODAY}.md`, basename: TODAY });

		const saved = app._saves.get(`Notes/${TODAY}.md`)!;
		expect(saved).toContain('### Activities:');
		expect(saved).toContain('Tasks/my-task.md');
	});

	it('uses the custom journalFolder for the canonical header', async () => {
		const composer = new DailyNoteComposer({
			journalFolder: 'Diary',
			projectsFolder: 'Projects',
			activitiesFolder: 'Activities',
			archiveFolder: 'Activities/Archive',
		});

		const app = makeApp({
			[`Diary/${TODAY}.md`]: '```dataviewjs\ncode\n```',
		});

		await composer.processDailyNote(app, { path: `Diary/${TODAY}.md`, basename: TODAY });

		const saved = app._saves.get(`Diary/${TODAY}.md`);
		expect(saved).toContain('---\n---\n### ');
	});
});
