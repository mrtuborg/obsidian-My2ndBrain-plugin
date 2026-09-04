import { ActivitiesInProgress } from '../src/components/ActivitiesInProgress';
import { ACTIVITIES_BUILT_MARKER } from '../src/utilities/ActivitiesMarker';

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
	snoozeUntil?: string;
	takeToWork?: boolean;
	role?: string;
	journalTasks?: string[];
	doneTasks?: string[];
}): string {
	const {
		stage = 'doing',
		startDate = '2026-01-01',
		type,
		remind = 'daily',
		priority = 'medium',
		snoozeUntil,
		takeToWork,
		role,
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
		...(snoozeUntil ? [`snoozeUntil: ${snoozeUntil}`] : []),
		...(takeToWork === undefined ? [] : [`takeToWork: ${takeToWork}`]),
		...(role ? [`role: ${role}`] : []),
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
		expect(result).toContain(ACTIVITIES_BUILT_MARKER);
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

	// AIP-10: `remind` no longer gates the daily note — it only governs
	// Eisenhower Matrix visibility now. takeToWork is the sole gate here.
	it('ignores a future remind month — remind no longer gates the daily note', async () => {
		const app = makeApp([{
			path: 'Activities/deferred.md',
			content: makeActivityContent({ stage: 'doing', startDate: PAST, remind: '2099-09', journalTasks: ['Deferred task'] }),
		}]);

		const result = await aip.run(app, '');
		expect(result).toContain('deferred');
		expect(result).toContain('Deferred task');
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

	// AIP-12: a future remind date is likewise ignored by the daily note
	it('ignores a future remind date — remind no longer gates the daily note', async () => {
		const app = makeApp([{
			path: 'Activities/future-date.md',
			content: makeActivityContent({ stage: 'doing', startDate: PAST, remind: '2099-12-31', journalTasks: ['Far future task'] }),
		}]);

		const result = await aip.run(app, '');
		expect(result).toContain('future-date');
		expect(result).toContain('Far future task');
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

	// snoozeUntil also stopped gating the daily note — it hides an activity
	// from the Eisenhower Matrix (i.e. from being offered for planning) only.
	describe('snoozeUntil', () => {
		it('does not hide an activity from the daily note while snoozed', async () => {
			const app = makeApp([{
				path: 'Activities/on-vacation.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, snoozeUntil: FUTURE, journalTasks: ['Ship feature'] }),
			}]);

			const result = await aip.run(app, '');
			expect(result).toContain('on-vacation');
		});

		it('shows the activity again once today reaches snoozeUntil', async () => {
			const app = makeApp([{
				path: 'Activities/back-from-vacation.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, snoozeUntil: PAST, journalTasks: ['Ship feature'] }),
			}]);

			const result = await aip.run(app, '');
			expect(result).toContain('back-from-vacation');
		});

		it('shows the activity normally when snoozeUntil is absent', async () => {
			const app = makeApp([{
				path: 'Activities/no-snooze.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Task'] }),
			}]);

			const result = await aip.run(app, '');
			expect(result).toContain('no-snooze');
		});

		it('does not alter or interact with an independently-set remind value', async () => {
			const app = makeApp([{
				path: 'Activities/weekday-task.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, remind: 'weekdays', snoozeUntil: PAST, journalTasks: ['Task'] }),
			}]);

			// snoozeUntil has passed, so remind's own logic (weekdays) is what still applies
			const result = await aip.run(app, '');
			const day = new Date().getDay();
			const isWeekday = day >= 1 && day <= 5;
			if (isWeekday) {
				expect(result).toContain('weekday-task');
			} else {
				expect(result).not.toContain('weekday-task');
			}
		});

		it('ignores a malformed snoozeUntil value and shows the activity', async () => {
			const app = makeApp([{
				path: 'Activities/bad-snooze.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, snoozeUntil: 'not-a-date', journalTasks: ['Task'] }),
			}]);

			const result = await aip.run(app, '');
			expect(result).toContain('bad-snooze');
		});
	});

	// Size safety guard: an oversized activity must be skipped, not read into
	// the daily note or crash the whole build.
	describe('size guard', () => {
		it('skips an oversized activity but still shows others', async () => {
			const oversized = makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Huge task'] })
				+ '\n' + 'x'.repeat(800 * 1024); // 800KB > 720KB cap
			const app = makeApp([
				{ path: 'Activities/huge.md', content: oversized },
				{ path: 'Activities/normal.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Normal task'] }) },
			]);

			const result = await aip.run(app, '');
			expect(result).not.toContain('huge');
			expect(result).toContain('normal');
		});
	});

	// Role/context split — an activity's role comes from the Project(s) that
	// reference it via a header block, mirroring ProjectDescriptionInjector's
	// linkage. run() (daily note) always shows only unrolled activities;
	// runForRole() (Contexts/<Role>/YYYY-MM-DD.md) shows only that role's.
	describe('role/context split', () => {
		function projectFile(path: string, role: string | null, tagId: string): { path: string; content: string } {
			const lines = ['---'];
			if (role) lines.push(`role: ${role}`);
			lines.push('---', `##### [[Activities/${tagId}.md|${tagId}]]`, 'Some description');
			return { path, content: lines.join('\n') };
		}

		it('run() hides an activity whose linked project has a role', async () => {
			const app = makeApp([
				{ path: 'Activities/my-project.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Task'] }) },
				projectFile('Projects/Widget.md', 'Engineer', 'my-project'),
			]);

			const result = await aip.run(app, '');
			expect(result).toBe('');
		});

		it('run() always shows an activity with no linked project', async () => {
			const app = makeApp([
				{ path: 'Activities/unlinked.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Task'] }) },
			]);

			const result = await aip.run(app, '');
			expect(result).toContain('unlinked');
		});

		it('run() always shows an activity whose linked project has no role set', async () => {
			const app = makeApp([
				{ path: 'Activities/my-project.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Task'] }) },
				projectFile('Projects/Widget.md', null, 'my-project'),
			]);

			const result = await aip.run(app, '');
			expect(result).toContain('my-project');
		});

		it('runForRole() shows an activity whose linked project matches the role', async () => {
			const app = makeApp([
				{ path: 'Activities/my-project.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Task'] }) },
				projectFile('Projects/Widget.md', 'Engineer', 'my-project'),
			]);

			const result = await aip.runForRole(app, 'Engineer');
			expect(result).toContain('my-project');
		});

		it('runForRole() hides an activity whose linked project has a different role', async () => {
			const app = makeApp([
				{ path: 'Activities/my-project.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Task'] }) },
				projectFile('Projects/Widget.md', 'Family', 'my-project'),
			]);

			const result = await aip.runForRole(app, 'Engineer');
			expect(result).toBe('');
		});

		it('runForRole() hides an unrolled activity (it belongs in the daily note instead)', async () => {
			const app = makeApp([
				{ path: 'Activities/unlinked.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Task'] }) },
			]);

			const result = await aip.runForRole(app, 'Engineer');
			expect(result).toBe('');
		});

		it('runForRole() omits the redundant activities-built marker', async () => {
			const app = makeApp([
				{ path: 'Activities/my-project.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Task'] }) },
				projectFile('Projects/Widget.md', 'Engineer', 'my-project'),
			]);

			const result = await aip.runForRole(app, 'Engineer');
			expect(result).not.toContain(ACTIVITIES_BUILT_MARKER);
			expect(result).toContain('##### [[Activities/my-project.md|my-project]]');
		});

		it('run() always shows a type:inbox catch-all activity, even if its linked project has a role', async () => {
			const app = makeApp([
				{ path: 'Activities/Plan for Today.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, type: 'inbox', journalTasks: ['Task'] }) },
				projectFile('Projects/2ndbrain-system.md', 'Selfcare', 'Plan for Today'),
			]);

			const result = await aip.run(app, '');
			expect(result).toContain('Plan for Today');
		});

		it('runForRole() never shows a type:inbox catch-all activity, regardless of its project role', async () => {
			const app = makeApp([
				{ path: 'Activities/Plan for Today.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, type: 'inbox', journalTasks: ['Task'] }) },
				projectFile('Projects/2ndbrain-system.md', 'Selfcare', 'Plan for Today'),
			]);

			const result = await aip.runForRole(app, 'Selfcare');
			expect(result).toBe('');
		});

		it('rolesWithActivities() returns the set of roles that have qualifying activities today', async () => {
			const app = makeApp([
				{ path: 'Activities/eng-task.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Task'] }) },
				projectFile('Projects/Widget.md', 'Engineer', 'eng-task'),
				{ path: 'Activities/family-task.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Task'] }) },
				projectFile('Projects/Home.md', 'Family', 'family-task'),
				{ path: 'Activities/unlinked.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Task'] }) },
			]);

			const roles = await aip.rolesWithActivities(app);
			expect(roles).toEqual(new Set(['Engineer', 'Family']));
		});

		it("runForRole() shows an activity using its own role field, with no linked project at all", async () => {
			const app = makeApp([
				{ path: 'Activities/solo-task.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, role: 'Family', journalTasks: ['Task'] }) },
			]);

			const result = await aip.runForRole(app, 'Family');
			expect(result).toContain('solo-task');
		});

		it("an activity's own role field takes precedence over its linked project's role", async () => {
			const app = makeApp([
				{ path: 'Activities/my-project.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, role: 'Selfcare', journalTasks: ['Task'] }) },
				projectFile('Projects/Widget.md', 'Engineer', 'my-project'),
			]);

			// Shows under its own role, not the project's role.
			const selfcare = await aip.runForRole(app, 'Selfcare');
			expect(selfcare).toContain('my-project');

			const engineer = await aip.runForRole(app, 'Engineer');
			expect(engineer).toBe('');
		});

		it('type: inbox activities stay in the daily note even with their own role field set', async () => {
			const app = makeApp([
				{ path: 'Activities/Plan for Today.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, type: 'inbox', role: 'Selfcare', journalTasks: ['Task'] }) },
			]);

			const result = await aip.runForRole(app, 'Selfcare');
			expect(result).toBe('');

			const daily = await aip.run(app, '');
			expect(daily).toContain('Plan for Today');
		});
	});
	// takeToWork is the gate for the daily note
	describe('takeToWork', () => {
		it('includes an activity explicitly taken to work', async () => {
			const app = makeApp([{
				path: 'Activities/planned.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, takeToWork: true, journalTasks: ['Planned task'] }),
			}]);

			const result = await aip.run(app, '');
			expect(result).toContain('planned');
			expect(result).toContain('Planned task');
		});

		it('excludes an activity explicitly not taken to work, even when doing', async () => {
			const app = makeApp([{
				path: 'Activities/not-planned.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, takeToWork: false, journalTasks: ['Unplanned task'] }),
			}]);

			const result = await aip.run(app, '');
			expect(result).not.toContain('not-planned');
			expect(result).not.toContain('Unplanned task');
		});

		it('includes a backlog activity that was taken to work from the matrix', async () => {
			const app = makeApp([{
				path: 'Activities/pulled-from-backlog.md',
				content: makeActivityContent({ stage: 'backlog', startDate: PAST, takeToWork: true, journalTasks: ['Backlog task'] }),
			}]);

			const result = await aip.run(app, '');
			expect(result).toContain('pulled-from-backlog');
		});

		it('never includes a done activity, even if takeToWork was left true', async () => {
			const app = makeApp([{
				path: 'Activities/finished.md',
				content: makeActivityContent({ stage: 'done', startDate: PAST, takeToWork: true, journalTasks: ['Old task'] }),
			}]);

			const result = await aip.run(app, '');
			expect(result).not.toContain('finished');
		});

		it('falls back to stage === doing when the field is missing (pre-backfill vault)', async () => {
			const app = makeApp([
				{ path: 'Activities/legacy-doing.md', content: makeActivityContent({ stage: 'doing', startDate: PAST, journalTasks: ['Legacy task'] }) },
				{ path: 'Activities/legacy-backlog.md', content: makeActivityContent({ stage: 'backlog', startDate: PAST, journalTasks: ['Backlog task'] }) },
			]);

			const result = await aip.run(app, '');
			expect(result).toContain('legacy-doing');
			expect(result).not.toContain('legacy-backlog');
		});
	});
	// The daily note is the source of truth (D1): once something is written
	// under an activity, no rebuild and no button may take it away.
	describe('protecting what the note already says', () => {
		const noteWith = (blocks: string[]) =>
			['----', '', ACTIVITIES_BUILT_MARKER, '----', ...blocks].join('\n');

		it('keeps a dropped activity that has content written under it', async () => {
			const app = makeApp([{
				path: 'Activities/dropped.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, takeToWork: false }),
			}]);
			const existing = noteWith([
				'##### [[Activities/dropped.md|dropped]]',
				'- [ ] something I actually did',
				'----',
			]);

			const result = await aip.run(app, existing);
			expect(result).toContain('dropped');
			expect(result).toContain('- [ ] something I actually did');
		});

		it('keeps a done activity that has content written under it', async () => {
			const app = makeApp([{
				path: 'Activities/finished.md',
				content: makeActivityContent({ stage: 'done', startDate: PAST }),
			}]);
			const existing = noteWith([
				'##### [[Activities/finished.md|finished]]',
				'Notes from the call.',
				'----',
			]);

			const result = await aip.run(app, existing);
			expect(result).toContain('Notes from the call.');
		});

		it('lets an empty block of a dropped activity disappear', async () => {
			const app = makeApp([{
				path: 'Activities/dropped.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, takeToWork: false }),
			}]);
			const existing = noteWith(['##### [[Activities/dropped.md|dropped]]', '----']);

			expect(await aip.run(app, existing)).toBe('');
		});

		it('preserves hand-written prose under an activity that still qualifies', async () => {
			const app = makeApp([{
				path: 'Activities/live.md',
				content: makeActivityContent({
					stage: 'doing', startDate: PAST, takeToWork: true, journalTasks: ['Fix bug'],
				}),
			}]);
			const existing = noteWith([
				'##### [[Activities/live.md|live]]',
				'Spoke to Anna, she wants the report by Friday.',
				'----',
			]);

			const result = await aip.run(app, existing);
			expect(result).toContain('Spoke to Anna, she wants the report by Friday.');
			expect(result).toContain('- [ ] Fix bug');
		});

		it('does not duplicate a todo the note already lists', async () => {
			const app = makeApp([{
				path: 'Activities/live.md',
				content: makeActivityContent({
					stage: 'doing', startDate: PAST, takeToWork: true, journalTasks: ['Fix bug'],
				}),
			}]);
			const existing = noteWith([
				'##### [[Activities/live.md|live]]',
				'- [ ] Fix bug',
				'----',
			]);

			const result = await aip.run(app, existing);
			expect(result.match(/- \[ \] Fix bug/g)).toHaveLength(1);
		});

		it('renders each retained activity exactly once', async () => {
			const app = makeApp([{
				path: 'Activities/live.md',
				content: makeActivityContent({ stage: 'doing', startDate: PAST, takeToWork: true }),
			}]);
			const existing = noteWith([
				'##### [[Activities/live.md|live]]',
				'a note',
				'----',
			]);

			const result = await aip.run(app, existing);
			expect(result.match(/##### \[\[Activities\/live\.md/g)).toHaveLength(1);
		});
	});
});
