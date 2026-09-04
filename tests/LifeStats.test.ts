import { buildLifeBalance, buildConsistency, JournalDay } from '../src/components/LifeStats';

const ROLES = ['Family', 'Engineer', 'TechLead', 'Entrepreneur', 'Selfcare'];
const TODAY = '2026-09-01';

function shift(iso: string, days: number): string {
	const d = new Date(iso + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

function day(date: string, roles: string[] = [], size = 500): JournalDay {
	return { date, roles, size };
}

describe('buildLifeBalance', () => {
	it('counts the days each role showed up', () => {
		const balance = buildLifeBalance(TODAY, [
			day(shift(TODAY, -1), ['Engineer', 'Family']),
			day(shift(TODAY, -2), ['Engineer']),
			day(shift(TODAY, -3), ['Engineer']),
		], ROLES);

		expect(balance.roles.map(r => [r.role, r.days])).toEqual([
			['Family', 1], ['Engineer', 3], ['TechLead', 0],
			['Entrepreneur', 0], ['Selfcare', 0],
		]);
	});

	it('normalizes against the busiest role, so the shape reads as balance', () => {
		const balance = buildLifeBalance(TODAY, [
			day(shift(TODAY, -1), ['Engineer', 'Family']),
			day(shift(TODAY, -2), ['Engineer']),
		], ROLES);

		const byRole = new Map(balance.roles.map(r => [r.role, r.ratio]));
		expect(byRole.get('Engineer')).toBe(1);
		expect(byRole.get('Family')).toBe(0.5);
		expect(byRole.get('TechLead')).toBe(0);
		expect(balance.peak).toBe(2);
	});

	it('always gives every role an axis, even one with nothing on it', () => {
		const balance = buildLifeBalance(TODAY, [day(shift(TODAY, -1), ['Engineer'])], ROLES);
		expect(balance.roles).toHaveLength(ROLES.length);
	});

	it('ignores days outside the window', () => {
		const balance = buildLifeBalance(TODAY, [
			day(shift(TODAY, -10), ['Engineer']),
			day(shift(TODAY, -400), ['Engineer']),
			day(shift(TODAY, 5), ['Engineer']),
		], ROLES);
		expect(balance.roles.find(r => r.role === 'Engineer')!.days).toBe(1);
	});

	it('reports no data rather than drawing a dot at the centre', () => {
		expect(buildLifeBalance(TODAY, [], ROLES).hasData).toBe(false);
		expect(buildLifeBalance(TODAY, [day(shift(TODAY, -1), [])], ROLES).hasData).toBe(false);
		expect(buildLifeBalance(TODAY, [day(shift(TODAY, -1), ['Family'])], ROLES).hasData)
			.toBe(true);
	});

	it('reports the mean ratio as the balanced-year reference ring', () => {
		const balance = buildLifeBalance(TODAY, [
			day(shift(TODAY, -1), ROLES),
		], ROLES);
		expect(balance.mean).toBe(1);
	});
});

describe('buildConsistency', () => {
	it('lays the window out as Sunday-first columns of seven', () => {
		const data = buildConsistency(TODAY, [], 28);
		expect(data.weeks.every(w => w.length === 7)).toBe(true);

		const dates = data.weeks.flat().filter((d): d is NonNullable<typeof d> => d !== null);
		expect(dates[0]!.date).toBe(shift(TODAY, -27));
		expect(dates[dates.length - 1]!.date).toBe(TODAY);
		expect(dates).toHaveLength(28);
	});

	it('pads the partial weeks at each end instead of shifting the rows', () => {
		const data = buildConsistency(TODAY, [], 28);
		const first = data.weeks[0]!;
		// 2026-09-01 is a Tuesday, so the window opens mid-week.
		expect(first.filter(c => c === null).length).toBeGreaterThan(0);
		expect(first[0]).toBeNull();
	});

	it('gives a day with no note level 0', () => {
		const data = buildConsistency(TODAY, [day(TODAY)], 7);
		const cells = data.weeks.flat().filter(c => c !== null);
		expect(cells.find(c => c!.date === TODAY)!.level).toBeGreaterThan(0);
		expect(cells.find(c => c!.date === shift(TODAY, -3))!.level).toBe(0);
	});

	it('scales levels against your own days, not fixed byte counts', () => {
		const days = [
			day(shift(TODAY, -1), [], 100),
			day(shift(TODAY, -2), [], 200),
			day(shift(TODAY, -3), [], 5000),
		];
		const data = buildConsistency(TODAY, days, 14);
		const level = (d: string) =>
			data.weeks.flat().find(c => c?.date === d)!.level;

		expect(level(shift(TODAY, -1))).toBe(1);
		expect(level(shift(TODAY, -3))).toBeGreaterThan(level(shift(TODAY, -1)));
	});

	it('counts a day split across several roles as a broader day', () => {
		const data = buildConsistency(TODAY, [
			day(shift(TODAY, -1), [], 100),
			day(shift(TODAY, -2), ['Engineer', 'Family'], 100),
		], 14);
		const level = (d: string) => data.weeks.flat().find(c => c?.date === d)!.level;
		expect(level(shift(TODAY, -2))).toBe(level(shift(TODAY, -1)) + 1);
	});

	it('counts the current streak back from today', () => {
		const data = buildConsistency(TODAY, [
			day(TODAY), day(shift(TODAY, -1)), day(shift(TODAY, -2)),
			day(shift(TODAY, -5)),
		], 30);
		expect(data.currentStreak).toBe(3);
	});

	it("doesn't break the streak just because today isn't written yet", () => {
		const data = buildConsistency(TODAY, [
			day(shift(TODAY, -1)), day(shift(TODAY, -2)),
		], 30);
		expect(data.currentStreak).toBe(2);
	});

	it('reports the longest run in the window and the total active days', () => {
		const data = buildConsistency(TODAY, [
			day(shift(TODAY, -1)),
			day(shift(TODAY, -10)), day(shift(TODAY, -11)),
			day(shift(TODAY, -12)), day(shift(TODAY, -13)),
		], 30);
		expect(data.longestStreak).toBe(4);
		expect(data.activeDays).toBe(5);
		expect(data.currentStreak).toBe(1);
	});

	it('labels the column where each month starts', () => {
		const data = buildConsistency(TODAY, [], 60);
		// September only has a two-day column here, so it borrows August's
		// label rather than crowding one in; over a full year every month
		// owns a column and gets its own.
		expect(data.monthLabels.map(m => m.label)).toEqual(['Jul', 'Aug']);
		expect(data.monthLabels.every(m => m.week >= 0)).toBe(true);
		expect(buildConsistency(TODAY, [], 364).monthLabels).toHaveLength(12);
	});
});
