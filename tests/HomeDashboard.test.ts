import { HomeDashboard, greeting, longDate } from '../src/components/HomeDashboard';

const dashboard = new HomeDashboard();

function activity(role: string, stage: string, takeToWork: boolean, project = 'p') {
	return { role, project, stage, takeToWork };
}

const NO_ROLES = new Map<string, string | null>();

function build(opts: {
	roles?: Map<string, string | null>;
	activities?: ReturnType<typeof activity>[];
	projects?: Array<{ role: string; health: string }>;
	journal?: Array<{ path: string; basename: string }>;
	today?: string;
	limit?: number;
}) {
	return dashboard.buildSummary(
		opts.today ?? '2026-09-05',
		null,
		opts.roles ?? NO_ROLES,
		opts.activities ?? [],
		opts.projects ?? [],
		opts.journal ?? [],
		opts.limit
	);
}

describe('HomeDashboard totals', () => {
	it('counts open activities and the ones taken to work today', () => {
		const summary = build({
			activities: [
				activity('Engineer', 'doing', true),
				activity('Engineer', 'backlog', false),
				activity('Family', 'done', false),
			],
		});
		expect(summary.openTotal).toBe(2);
		expect(summary.takenToday).toBe(1);
	});

	it('never counts a done activity as taken, even if the flag lingers', () => {
		const summary = build({ activities: [activity('Engineer', 'done', true)] });
		expect(summary.takenToday).toBe(0);
		expect(summary.openTotal).toBe(0);
	});
});

describe('HomeDashboard role balance', () => {
	const roles = new Map<string, string | null>([['Engineer', null], ['Family', null]]);

	it('reports taken and open per role', () => {
		const summary = build({
			roles,
			activities: [
				activity('Engineer', 'doing', true),
				activity('Engineer', 'backlog', false),
				activity('Family', 'backlog', false),
			],
		});
		expect(summary.roles[0]).toMatchObject({ role: 'Engineer', taken: 1, open: 2 });
		expect(summary.roles[1]).toMatchObject({ role: 'Family', taken: 0, open: 1 });
	});

	it('flags a role as untouched when it has open work but nothing planned', () => {
		const summary = build({
			roles,
			activities: [activity('Engineer', 'doing', true), activity('Family', 'backlog', false)],
		});
		expect(summary.roles[0]!.untouched).toBe(false);
		expect(summary.roles[1]!.untouched).toBe(true);
	});

	it('does not call a role with no open work untouched', () => {
		const summary = build({ roles, activities: [activity('Family', 'done', false)] });
		expect(summary.roles[1]).toMatchObject({ open: 0, untouched: false });
	});

	it('counts only decision-needing projects against a role', () => {
		const summary = build({
			roles,
			projects: [
				{ role: 'Engineer', health: 'stalled' },
				{ role: 'Engineer', health: 'no-next-action' },
				{ role: 'Engineer', health: 'active' },
				{ role: 'Family', health: 'complete' },
			],
		});
		expect(summary.roles[0]!.needsDecision).toBe(2);
		expect(summary.roles[1]!.needsDecision).toBe(0);
	});

	it('carries through each role\'s context page path', () => {
		const summary = build({
			roles: new Map([['Engineer', 'Journal/Contexts/2026-09-05-Engineer.md']]),
		});
		expect(summary.roles[0]!.contextPath).toBe('Journal/Contexts/2026-09-05-Engineer.md');
	});
});

describe('HomeDashboard health signals', () => {
	it('reports stalled and no-next-action project counts', () => {
		const summary = build({
			projects: [
				{ role: 'Engineer', health: 'stalled' },
				{ role: 'Family', health: 'stalled' },
				{ role: 'Family', health: 'no-next-action' },
				{ role: 'Family', health: 'active' },
			],
		});
		expect(summary.signals).toEqual([
			{ id: 'stalled', label: 'stalled', count: 2, target: 'projects' },
			{ id: 'no-next-action', label: 'no next action', count: 1, target: 'projects' },
		]);
	});

	it('counts open project-less and inbox activities as untriaged', () => {
		const summary = build({
			activities: [
				activity('Engineer', 'backlog', false, ''),
				activity('Engineer', 'backlog', false, 'Inbox'),
				activity('Engineer', 'done', false, ''),
				activity('Engineer', 'backlog', false, 'real'),
			],
		});
		const untriaged = summary.signals.find(s => s.id === 'untriaged');
		expect(untriaged).toMatchObject({ count: 2, target: 'inbox' });
	});

	it('counts open activities with no role', () => {
		const summary = build({
			activities: [activity('', 'backlog', false), activity('', 'done', false)],
		});
		expect(summary.signals.find(s => s.id === 'unroled')).toMatchObject({
			count: 1, target: 'matrix',
		});
	});

	it('omits signals that are clear, and says so when everything is', () => {
		const summary = build({ activities: [activity('Engineer', 'doing', true)] });
		expect(summary.signals).toEqual([]);
		expect(summary.allClear).toBe(true);
	});

	it('is not all-clear when any signal fires', () => {
		const summary = build({ projects: [{ role: 'Engineer', health: 'stalled' }] });
		expect(summary.allClear).toBe(false);
	});
});

describe('HomeDashboard recent journal', () => {
	it('sorts newest first, excludes today, and caps at the limit', () => {
		const summary = build({
			journal: [
				{ path: 'Journal/2026-09-01.md', basename: '2026-09-01' },
				{ path: 'Journal/2026-09-05.md', basename: '2026-09-05' },
				{ path: 'Journal/2026-09-04.md', basename: '2026-09-04' },
				{ path: 'Journal/2026-09-03.md', basename: '2026-09-03' },
			],
			limit: 2,
		});
		expect(summary.recentJournal.map(f => f.basename)).toEqual(['2026-09-04', '2026-09-03']);
	});

	it('ignores files that are not plain dates', () => {
		const summary = build({
			journal: [
				{ path: 'Journal/Contexts/2026-09-01-Engineer.md', basename: '2026-09-01-Engineer' },
				{ path: 'Journal/2026-09-01.md', basename: '2026-09-01' },
			],
		});
		expect(summary.recentJournal.map(f => f.basename)).toEqual(['2026-09-01']);
	});
});

describe('greeting', () => {
	it.each([
		[3, 'Still awake'],
		[9, 'Good morning'],
		[14, 'Good afternoon'],
		[21, 'Good evening'],
	])('at %i:00 says %s', (hour, expected) => {
		expect(greeting(hour as number)).toBe(expected);
	});
});

describe('longDate', () => {
	it('renders a weekday and a human date', () => {
		expect(longDate('2026-09-01')).toBe('Tuesday, 1 September');
	});

	it('passes an unparseable value straight through', () => {
		expect(longDate('not-a-date')).toBe('not-a-date');
	});
});
