import { ProjectsDashboard, DashboardActivity, DashboardProject, UNASSIGNED } from '../src/components/ProjectsDashboard';

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

	it('buckets blank and "inbox" project values into UNASSIGNED', () => {
		const dashboard = new ProjectsDashboard();
		const activities = [
			activity({ project: '' }),
			activity({ project: 'inbox' }),
			activity({ project: 'Inbox' }),
		];
		const rows = dashboard.buildRows(activities, []);

		expect(rows).toHaveLength(1);
		expect(rows[0]!.slug).toBe(UNASSIGNED);
		expect(rows[0]!.total).toBe(3);
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

	it('sorts UNASSIGNED last regardless of role, and by role then ascending percentDone otherwise', () => {
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
		expect(slugs).toEqual(['behind', 'far-along', UNASSIGNED]);
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
	});

	it('renders a friendly empty state when there is nothing to show', () => {
		const dashboard = new ProjectsDashboard();
		const md = dashboard.render([], '2026-08-13');
		expect(md).toContain('No projects or activities found');
	});
});
