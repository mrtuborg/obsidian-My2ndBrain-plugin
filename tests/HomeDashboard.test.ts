import { HomeDashboard } from '../src/components/HomeDashboard';

describe('HomeDashboard', () => {
	const dashboard = new HomeDashboard();

	it('carries through today and the daily note path unchanged', () => {
		const summary = dashboard.buildSummary(
			'2026-09-05', 'Journal/2026-09-05.md', new Map(), [], []
		);
		expect(summary.today).toBe('2026-09-05');
		expect(summary.dailyNotePath).toBe('Journal/2026-09-05.md');
	});

	it('reports null daily note path when none exists yet', () => {
		const summary = dashboard.buildSummary('2026-09-05', null, new Map(), [], []);
		expect(summary.dailyNotePath).toBeNull();
	});

	it('turns the role→path map into a role status list', () => {
		const roles = new Map([
			['Engineer', 'Journal/Contexts/2026-09-05-Engineer.md'],
			['Family', null],
		]);
		const summary = dashboard.buildSummary('2026-09-05', null, roles, [], []);
		expect(summary.roles).toEqual([
			{ role: 'Engineer', path: 'Journal/Contexts/2026-09-05-Engineer.md' },
			{ role: 'Family', path: null },
		]);
	});

	it('counts open activities with no project as inbox pressure', () => {
		const summary = dashboard.buildSummary('2026-09-05', null, new Map(), [
			{ project: '', stage: 'backlog' },
			{ project: 'inbox', stage: 'doing' },
			{ project: 'Inbox', stage: 'done' }, // done: doesn't count even without a real project
			{ project: 'real-project', stage: 'backlog' },
		], []);
		expect(summary.inboxCount).toBe(2);
	});

	it('sorts recent journal entries newest first and excludes today', () => {
		const summary = dashboard.buildSummary('2026-09-05', null, new Map(), [], [
			{ path: 'Journal/2026-09-01.md', basename: '2026-09-01' },
			{ path: 'Journal/2026-09-05.md', basename: '2026-09-05' }, // today, excluded
			{ path: 'Journal/2026-09-03.md', basename: '2026-09-03' },
		]);
		expect(summary.recentJournal.map(f => f.basename)).toEqual(['2026-09-03', '2026-09-01']);
	});

	it('ignores non-date files (e.g. Context pages) in the journal folder', () => {
		const summary = dashboard.buildSummary('2026-09-05', null, new Map(), [], [
			{ path: 'Journal/Contexts/2026-09-01-Engineer.md', basename: '2026-09-01-Engineer' },
			{ path: 'Journal/2026-09-01.md', basename: '2026-09-01' },
		]);
		expect(summary.recentJournal.map(f => f.basename)).toEqual(['2026-09-01']);
	});

	it('caps the recent journal list at the given limit', () => {
		const files = ['01', '02', '03', '04'].map(d => ({
			path: `Journal/2026-09-${d}.md`, basename: `2026-09-${d}`,
		}));
		const summary = dashboard.buildSummary('2026-09-05', null, new Map(), [], files, 2);
		expect(summary.recentJournal).toHaveLength(2);
		expect(summary.recentJournal.map(f => f.basename)).toEqual(['2026-09-04', '2026-09-03']);
	});
});
