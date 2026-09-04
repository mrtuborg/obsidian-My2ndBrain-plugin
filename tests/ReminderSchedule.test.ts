import { remindAllowsDate, isSnoozed, scheduleAllowsToday, dayOfWeekFor } from '../src/utilities/ReminderSchedule';

describe('ReminderSchedule.dayOfWeekFor', () => {
	it('maps dates to weekday indices in UTC', () => {
		expect(dayOfWeekFor('2026-08-31')).toBe(1); // Monday
		expect(dayOfWeekFor('2026-09-05')).toBe(6); // Saturday
		expect(dayOfWeekFor('2026-09-06')).toBe(0); // Sunday
	});
});

describe('ReminderSchedule.remindAllowsDate', () => {
	const MONDAY = '2026-08-31';
	const SATURDAY = '2026-09-05';

	it('allows everything for blank, daily, or unknown values', () => {
		for (const v of ['', '   ', 'daily', 'whenever']) {
			expect(remindAllowsDate(v, MONDAY, 1)).toBe(true);
		}
		expect(remindAllowsDate(null, MONDAY, 1)).toBe(true);
	});

	it('honours weekdays and weekends', () => {
		expect(remindAllowsDate('weekdays', MONDAY, 1)).toBe(true);
		expect(remindAllowsDate('weekdays', SATURDAY, 6)).toBe(false);
		expect(remindAllowsDate('weekends', SATURDAY, 6)).toBe(true);
		expect(remindAllowsDate('weekends', MONDAY, 1)).toBe(false);
	});

	it('honours a named weekday, case-insensitively', () => {
		expect(remindAllowsDate('Monday', MONDAY, 1)).toBe(true);
		expect(remindAllowsDate('monday', SATURDAY, 6)).toBe(false);
	});

	it('treats YYYY-MM-DD and YYYY-MM as "from then onward"', () => {
		expect(remindAllowsDate('2099-12-31', MONDAY, 1)).toBe(false);
		expect(remindAllowsDate('2020-06-15', MONDAY, 1)).toBe(true);
		expect(remindAllowsDate('2099-09', MONDAY, 1)).toBe(false);
		expect(remindAllowsDate('2020-01', MONDAY, 1)).toBe(true);
	});
});

describe('ReminderSchedule.isSnoozed', () => {
	it('is true only while today is before the snooze date', () => {
		expect(isSnoozed('2099-01-01', '2026-08-31')).toBe(true);
		expect(isSnoozed('2026-08-31', '2026-08-31')).toBe(false);
		expect(isSnoozed('2020-01-01', '2026-08-31')).toBe(false);
	});

	it('ignores blank and malformed values', () => {
		expect(isSnoozed('', '2026-08-31')).toBe(false);
		expect(isSnoozed('soon', '2026-08-31')).toBe(false);
		expect(isSnoozed(null, '2026-08-31')).toBe(false);
	});
});

describe('ReminderSchedule.scheduleAllowsToday', () => {
	it('snooze wins over an otherwise-allowing remind', () => {
		expect(scheduleAllowsToday('daily', '2099-01-01', '2026-08-31')).toBe(false);
	});

	it('allows when neither field blocks', () => {
		expect(scheduleAllowsToday('weekdays', '', '2026-08-31')).toBe(true);
	});
});
