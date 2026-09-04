import { ProjectsDashboard, DashboardActivity, DashboardProject } from '../src/components/ProjectsDashboard';

function activity(overrides: Partial<DashboardActivity> = {}): DashboardActivity {
	return {
		path: 'Activities/a.md',
		displayName: 'a',
		project: '',
		role: '',
		stage: 'doing',
		startDate: '2026-01-01',
		...overrides,
	};
}

function project(overrides: Partial<DashboardProject> = {}): DashboardProject {
	return {
		slug: 'my-project',
		path: 'Projects/my-project.md',
		role: '',
		...overrides,
	};
}

describe('ProjectsDashboard.buildRows', () => {
	it('groups activities by project and computes done/total counts', () => {
		const dashboard = new ProjectsDashboard();
		const activities = [
			activity({ path: 'Activities/a1.md', project: 'roommate', stage: 'done', startDate: '2026-01-01' }),
			activity({ path: 'Activities/a2.md', project: 'roommate', stage: 'doing', startDate: '2026-01-05' }),
			activity({ path: 'Activities/a3.md', project: 'roommate', stage: 'backlog', startDate: '2026-01-10' }),
		];
		const rows = dashboard.buildRows(activities, [project({ slug: 'roommate', path: 'Projects/roommate.md' })]);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			slug: 'roommate',
			path: 'Projects/roommate.md',
			total: 3,
			done: 1,
			doing: 1,
			backlog: 1,
			percentDone: 33,
		});
	});

	it('folds blank and "inbox" (any case) project values into the real Inbox project', () => {
		const dashboard = new ProjectsDashboard();
		const activities = [
			activity({ project: '' }),
			activity({ project: 'inbox' }),
			activity({ project: 'Inbox' }),
		];
		const rows = dashboard.buildRows(activities, [project({ slug: 'Inbox', path: 'Projects/Inbox.md', role: 'Selfcare' })]);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ slug: 'Inbox', path: 'Projects/Inbox.md', role: 'Selfcare', total: 3 });
	});

	it('falls back to a bare "inbox" row (no path) when no Inbox project file exists', () => {
		const dashboard = new ProjectsDashboard();
		const rows = dashboard.buildRows([activity({ project: '' })], []);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ slug: 'inbox', path: null, total: 1 });
	});

	it('includes known projects with zero activities (surfaces dormant projects)', () => {
		const dashboard = new ProjectsDashboard();
		const rows = new ProjectsDashboard().buildRows([], [project({ slug: 'dormant' })]);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ slug: 'dormant', total: 0, done: 0, percentDone: 0 });
		void dashboard;
	});

	it('prefers the project file role, falling back to the most common activity role', () => {
		const dashboard = new ProjectsDashboard();
		const rows = dashboard.buildRows(
			[
				activity({ project: 'no-role-project', role: 'Engineer' }),
				activity({ project: 'no-role-project', role: 'Engineer' }),
				activity({ project: 'no-role-project', role: 'Family' }),
			],
			[]
		);
		expect(rows[0]!.role).toBe('Engineer');
	});

	it('computes oldestOpenDate only from non-done activities, and latestDate from all', () => {
		const dashboard = new ProjectsDashboard();
		const rows = dashboard.buildRows(
			[
				activity({ project: 'p', stage: 'done', startDate: '2026-01-01' }),
				activity({ project: 'p', stage: 'doing', startDate: '2026-01-15' }),
				activity({ project: 'p', stage: 'backlog', startDate: '2026-01-10' }),
			],
			[]
		);
		expect(rows[0]!.oldestOpenDate).toBe('2026-01-10');
		expect(rows[0]!.latestDate).toBe('2026-01-15');
	});

	it('ignores activities with missing/invalid startDate when computing dates', () => {
		const dashboard = new ProjectsDashboard();
		const rows = dashboard.buildRows(
			[activity({ project: 'p', stage: 'doing', startDate: '' })],
			[]
		);
		expect(rows[0]!.oldestOpenDate).toBe('');
		expect(rows[0]!.latestDate).toBe('');
	});

	it('sorts by role then ascending percentDone, with unmatched projects sorted the same way', () => {
		const dashboard = new ProjectsDashboard();
		const rows = dashboard.buildRows(
			[
				activity({ project: 'inbox' }),
				activity({ project: 'far-along', stage: 'done' }),
				activity({ project: 'far-along', stage: 'done' }),
				activity({ project: 'behind', stage: 'backlog' }),
			],
			[
				project({ slug: 'far-along', role: 'Engineer' }),
				project({ slug: 'behind', role: 'Engineer' }),
			]
		);
		const slugs = rows.map(r => r.slug);
		// "inbox" has no matching project file here, so it falls back to a
		// bare, roleless row — roleless rows sort after any role is known.
		expect(slugs).toEqual(['behind', 'far-along', 'inbox']);
	});
});

describe('ProjectsDashboard health', () => {
	const dashboard = new ProjectsDashboard();
	const TODAY = '2026-09-01';

	function health(activities: DashboardActivity[], projects: DashboardProject[] = []) {
		return dashboard.buildRows(activities, projects, TODAY)[0]!;
	}

	it('marks a project with no activities as empty', () => {
		expect(health([], [project({ slug: 'dormant' })]).health).toBe('empty');
	});

	it('marks a project whose activities are all done as complete', () => {
		const row = health([
			activity({ project: 'p', stage: 'done', startDate: TODAY }),
			activity({ project: 'p', stage: 'done', startDate: TODAY }),
		]);
		expect(row.health).toBe('complete');
		expect(row.open).toBe(0);
	});

	it('marks open work untouched for longer than the stale window as stalled', () => {
		// 2025-11-26 is well past STALE_DAYS before 2026-09-01.
		const row = health([activity({ project: 'p', stage: 'doing', startDate: '2025-11-26' })]);
		expect(row.health).toBe('stalled');
		expect(row.daysSinceActivity).toBe(279);
	});

	it('marks recent open work with nothing in progress as no-next-action', () => {
		const row = health([activity({ project: 'p', stage: 'backlog', startDate: '2026-08-25' })]);
		expect(row.health).toBe('no-next-action');
	});

	it('marks recent work in progress as active', () => {
		const row = health([activity({ project: 'p', stage: 'doing', startDate: '2026-08-25' })]);
		expect(row.health).toBe('active');
	});

	it('never calls an undated project stalled — no date is not evidence of neglect', () => {
		const row = health([activity({ project: 'p', stage: 'doing', startDate: '' })]);
		expect(row.daysSinceActivity).toBeNull();
		expect(row.health).toBe('active');
	});

	it('leaves health undecided-by-date when no today is supplied', () => {
		const rows = dashboard.buildRows(
			[activity({ project: 'p', stage: 'doing', startDate: '2020-01-01' })], []
		);
		expect(rows[0]!.daysSinceActivity).toBeNull();
		expect(rows[0]!.health).toBe('active');
	});

	it('counts only open activities that are taken to work today', () => {
		const row = health([
			activity({ project: 'p', stage: 'doing', takeToWork: true }),
			activity({ project: 'p', stage: 'doing', takeToWork: false }),
			// Finished work is never "today's plan", even if the flag lingers.
			activity({ project: 'p', stage: 'done', takeToWork: true }),
		]);
		expect(row.takenToday).toBe(1);
	});

	it('sorts within a role by what needs a decision, most neglected first', () => {
		const rows = dashboard.buildRows(
			[
				activity({ project: 'humming', stage: 'doing', startDate: '2026-08-30' }),
				activity({ project: 'finished', stage: 'done', startDate: '2026-08-30' }),
				activity({ project: 'no-action', stage: 'backlog', startDate: '2026-08-30' }),
				activity({ project: 'old', stage: 'doing', startDate: '2026-01-01' }),
				activity({ project: 'older', stage: 'doing', startDate: '2025-01-01' }),
			],
			[
				project({ slug: 'humming', role: 'Engineer' }),
				project({ slug: 'finished', role: 'Engineer' }),
				project({ slug: 'no-action', role: 'Engineer' }),
				project({ slug: 'old', role: 'Engineer' }),
				project({ slug: 'older', role: 'Engineer' }),
				project({ slug: 'never-used', role: 'Engineer' }),
			],
			TODAY
		);
		expect(rows.map(r => r.slug)).toEqual([
			'older',      // stalled, oldest
			'old',        // stalled
			'no-action',  // no next action
			'humming',    // active
			'finished',   // complete
			'never-used', // empty
		]);
	});
});

describe('ProjectsDashboard.render', () => {
	it('renders a markdown table grouped by role, with an escaped wikilink to the project', () => {
		const dashboard = new ProjectsDashboard();
		const rows = dashboard.buildRows(
			[activity({ project: 'roommate', stage: 'done' })],
			[project({ slug: 'roommate', path: 'Projects/roommate.md', role: 'Engineer' })]
		);
		const md = dashboard.render(rows, '2026-08-13');

		expect(md).toContain('# Projects Dashboard');
		expect(md).toContain('## Engineer');
		expect(md).toContain('[[Projects/roommate\\|roommate]]');
		expect(md).toContain('1/1 (100%)');
		expect(md).toContain('Complete');
	});

	it('collects activity-less projects into one line instead of a screen of 0/0 rows', () => {
		const dashboard = new ProjectsDashboard();
		const rows = dashboard.buildRows(
			[activity({ project: 'real', stage: 'doing' })],
			[
				project({ slug: 'real', path: 'Projects/real.md', role: 'Engineer' }),
				project({ slug: 'ghost-a', path: 'Projects/ghost-a.md', role: 'Engineer' }),
				project({ slug: 'ghost-b', path: 'Projects/ghost-b.md', role: 'Family' }),
			]
		);
		const md = dashboard.render(rows, '2026-08-13');

		expect(md).toContain('## No activities (2)');
		expect(md).toContain('[[Projects/ghost-a\\|ghost-a]], [[Projects/ghost-b\\|ghost-b]]');
		// The ghosts must not also appear as rows in their role tables.
		expect(md).not.toContain('| [[Projects/ghost-a\\|ghost-a]] |');
		expect(md).not.toContain('## Family');
	});

	it('separates consecutive role sections with a blank line', () => {
		const dashboard = new ProjectsDashboard();
		const rows = dashboard.buildRows(
			[
				activity({ project: 'a', stage: 'doing', role: 'Engineer' }),
				activity({ project: 'b', stage: 'doing', role: 'Family' }),
			],
			[]
		);
		const md = dashboard.render(rows, '2026-08-13');
		expect(md).toContain('\n\n## Family');
	});

	it('renders a friendly empty state when there is nothing to show', () => {
		const dashboard = new ProjectsDashboard();
		const md = dashboard.render([], '2026-08-13');
		expect(md).toContain('No projects or activities found');
	});
});
