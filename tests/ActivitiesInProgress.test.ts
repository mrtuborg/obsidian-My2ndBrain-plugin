import { ActivitiesInProgress } from '../src/components/ActivitiesInProgress';

// Helper: build a mock vault file object
function makeFile(path: string): { path: string; name: string; basename: string } {
	const basename = path.split('/').pop()!.replace('.md', '');
	return { path, name: path.split('/').pop()!, basename };
}

// Helper: build raw activity file content
function makeActivityContent(opts: {
	stage?: string;
	startDate?: string;
	type?: string;
	remind?: string;
	priority?: string;
	context?: string;
	journalTasks?: string[];
	doneTasks?: string[];
}): string {
	const {
		stage = 'doing',
		startDate = '2026-01-01',
		type,
		remind = 'daily',
		priority = 'medium',
		context,
		journalTasks = [],
		doneTasks = [],
	} = opts;

	const lines = [
		'---',
		`startDate: ${startDate}`,
		`stage: ${stage}`,
		...(type ? [`type: ${type}`] : []),
		`remind: ${remind}`,
		`priority: ${priority}`,
		...(context ? [`context: ${context}`] : []),
		'---',
		'',
		'## Description',
		'',
		'----',
		'',
		'## Journal',
		'',
		...journalTasks.map(t => `- [ ] ${t}`),
		...doneTasks.map(t => `- [x] ${t}`),
		'',
		'----',
	];
	return lines.join('\n');
}

function makeApp(files: Array<{ path: string; content: string }>) {
	const fileMap = new Map(files.map(f => [f.path, f]));

	return {
		vault: {
			getFiles: jest.fn(() =>
				files.map(f => makeFile(f.path))
			),
			getAbstractFileByPath: jest.fn((path: string) =>
				fileMap.has(path) ? makeFile(path) : null
			),
			read: jest.fn(async (file: { path: string }) =>
				fileMap.get(file.path)?.content ?? ''
			),
		},
	} as any;
}

const TODAY = new Date().toISOString().slice(0, 10);
const PAST = '2026-01-01';
const FUTURE = '2099-12-31';

describe('ActivitiesInProgress', () => {
	const aip = new ActivitiesInProgress();

	// AIP-01: active activity appears
	it('includes an active activity with open todos', async () => {
		const app = makeApp([{
			path: 'Activities/my-project.md',
			content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Fix bug', 'Write docs'] }),
		}]);

		const result = await aip.run(app, '');
		expect(result).toContain('my-project');
		expect(result).toContain('Fix bug');
		expect(result).toContain('Write docs');
	});

	// AIP-02: done activity excluded
	it('excludes done activities', async () => {
		const app = makeApp([{
			path: 'Activities/done-project.md',
			content: makeActivityContent({ stage: 'done', startDate: PAST, journalTasks: ['Task'] }),
		}]);

		const result = await aip.run(app, '');
		expect(result).not.toContain('done-project');
	});

	// AIP-03: future activity excluded
	it('excludes activities with a future startDate', async () => {
		const app = makeApp([{
			path: 'Activities/future.md',
			content: makeActivityContent({ stage: 'doing', startDate: FUTURE, journalTasks: ['Task'] }),
		}]);

		const result = await aip.run(app, '');
		expect(result).not.toContain('future');
	});

	// AIP-04: archived activity excluded
	it('excludes activities in Activities/Archive/', async () => {
		const app = makeApp([{
			path: 'Activities/Archive/old.md',
			content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Task'] }),
		}]);

		const result = await aip.run(app, '');
		expect(result).not.toContain('old');
	});

	// AIP-05: inbox type always last
	it('places inbox-type activity after project-type', async () => {
		const app = makeApp([
			{
				path: 'Activities/plan-today.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, type: 'inbox', journalTasks: ['Inbox task'] }),
			},
			{
				path: 'Activities/real-project.md',
				content: makeActivityContent({ stage: 'doing', startDate: TODAY, type: 'project', journalTasks: ['Project task'] }),
			},
		]);

		const result = await aip.run(app, '');
		const projectIdx = result.indexOf('real-project');
		const inboxIdx = result.indexOf('plan-today');
		expect(projectIdx).toBeGreaterThan(-1);
		expect(inboxIdx).toBeGreaterThan(-1);
		expect(projectIdx).toBeLessThan(inboxIdx);
	});

	// AIP-06: older project appears before newer project
	it('sorts project activities by startDate ascending (oldest first)', async () => {
		const app = makeApp([
			{
				path: 'Activities/newer.md',
				content: makeActivityContent({ stage: 'doing', startDate: '2026-06-01', journalTasks: ['New task'] }),
			},
			{
				path: 'Activities/older.md',
				content: makeActivityContent({ stage: 'doing', startDate: '2026-01-01', journalTasks: ['Old task'] }),
			},
		]);

		const result = await aip.run(app, '');
		expect(result.indexOf('older')).toBeLessThan(result.indexOf('newer'));
	});

	// AIP-07: activity with no open todos shows header + separator only
	it('renders activity with no open todos as header + separator only', async () => {
		const app = makeApp([{
			path: 'Activities/all-done.md',
			content: makeActivityContent({ stage: 'doing', startDate: PAST, doneTasks: ['Finished task'] }),
		}]);

		const result = await aip.run(app, '');
		// Activity appears but no unchecked task line
		expect(result).toContain('all-done');
		expect(result).not.toContain('- [ ]');
	});

	// AIP-08: exact output format
	it('produces the correct Activities section format', async () => {
		const app = makeApp([{
			path: 'Activities/My Project.md',
			content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['The task'] }),
		}]);

		const result = await aip.run(app, '');
		expect(result).toContain('### Activities:');
		expect(result).toContain('##### [[Activities/My Project.md|My Project]]');
		expect(result).toContain('- [ ] The task');
	});

	// AIP-09: completed todo (matching [x] exists) is excluded from output
	it('excludes todos that have a matching done entry', async () => {
		const content = makeActivityContent({
			stage: 'doing',
			startDate: PAST,
			journalTasks: ['Do work'],
			doneTasks: ['Do work'],
		});
		const app = makeApp([{ path: 'Activities/project.md', content }]);

		const result = await aip.run(app, '');
		// "Do work" appears as done ([x]) but should not appear as open ([ ])
		expect(result).not.toContain('- [ ] Do work');
	});

	// AIP-10: remind YYYY-MM — future month hides activity
	it('excludes activity with remind set to a future month', async () => {
		const app = makeApp([{
			path: 'Activities/deferred.md',
			content: makeActivityContent({ stage: 'doing', startDate: PAST, remind: '2099-09', journalTasks: ['Deferred task'] }),
		}]);

		const result = await aip.run(app, '');
		expect(result).not.toContain('deferred');
	});

	// AIP-11: remind YYYY-MM — past month shows activity
	it('includes activity with remind set to a past month', async () => {
		const app = makeApp([{
			path: 'Activities/past-month.md',
			content: makeActivityContent({ stage: 'doing', startDate: PAST, remind: '2020-01', journalTasks: ['Old remind task'] }),
		}]);

		const result = await aip.run(app, '');
		expect(result).toContain('past-month');
		expect(result).toContain('Old remind task');
	});

	// AIP-12: remind YYYY-MM-DD — future date hides activity
	it('excludes activity with remind set to a future date', async () => {
		const app = makeApp([{
			path: 'Activities/future-date.md',
			content: makeActivityContent({ stage: 'doing', startDate: PAST, remind: '2099-12-31', journalTasks: ['Far future task'] }),
		}]);

		const result = await aip.run(app, '');
		expect(result).not.toContain('future-date');
	});

	// AIP-13: remind YYYY-MM-DD — past date shows activity
	it('includes activity with remind set to a past date', async () => {
		const app = makeApp([{
			path: 'Activities/past-date.md',
			content: makeActivityContent({ stage: 'doing', startDate: PAST, remind: '2020-06-15', journalTasks: ['Past date task'] }),
		}]);

		const result = await aip.run(app, '');
		expect(result).toContain('past-date');
		expect(result).toContain('Past date task');
	});

	// Frontmatter read from raw text, not metadataCache
	it('does NOT use app.metadataCache to determine activity stage', async () => {
		const app = makeApp([{
			path: 'Activities/project.md',
			content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Task'] }),
		}]);
		// Deliberately not adding metadataCache to app — should still work
		expect(app.metadataCache).toBeUndefined();
		const result = await aip.run(app, '');
		expect(result).toContain('Task');
	});

	// Vacation mode: work activities hidden, personal ones still shown
	describe('vacation mode', () => {
		it('shows work-context activities when vacation mode is off (default)', async () => {
			const aipDefault = new ActivitiesInProgress();
			const app = makeApp([{
				path: 'Activities/work-thing.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, context: 'work', journalTasks: ['Ship feature'] }),
			}]);

			const result = await aipDefault.run(app, '');
			expect(result).toContain('work-thing');
		});

		it('hides work-context activities when vacation mode is on', async () => {
			const aipVacation = new ActivitiesInProgress({
				activitiesFolder: 'Activities',
				archiveFolder: 'Activities/Archive',
				vacationMode: true,
			});
			const app = makeApp([{
				path: 'Activities/work-thing.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, context: 'work', journalTasks: ['Ship feature'] }),
			}]);

			const result = await aipVacation.run(app, '');
			expect(result).not.toContain('work-thing');
		});

		it('still shows personal (no context) activities when vacation mode is on', async () => {
			const aipVacation = new ActivitiesInProgress({
				activitiesFolder: 'Activities',
				archiveFolder: 'Activities/Archive',
				vacationMode: true,
			});
			const app = makeApp([{
				path: 'Activities/personal-thing.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Buy groceries'] }),
			}]);

			const result = await aipVacation.run(app, '');
			expect(result).toContain('personal-thing');
		});

		it('is case-insensitive when matching the work context', async () => {
			const aipVacation = new ActivitiesInProgress({
				activitiesFolder: 'Activities',
				archiveFolder: 'Activities/Archive',
				vacationMode: true,
			});
			const app = makeApp([{
				path: 'Activities/work-thing.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, context: 'Work', journalTasks: ['Ship feature'] }),
			}]);

			const result = await aipVacation.run(app, '');
			expect(result).not.toContain('work-thing');
		});
	});
});
