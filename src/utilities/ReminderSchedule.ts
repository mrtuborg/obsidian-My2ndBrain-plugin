/**
 * Evaluation of the `remind:` and `snoozeUntil:` frontmatter fields.
 *
 * These used to gate whether an activity appeared in the daily note. They no
 * longer do — `takeToWork` owns that decision now. Instead they gate whether
 * an activity is *visible in the Eisenhower Matrix*, i.e. whether it is worth
 * being offered for planning today at all.
 *
 * Pure logic, no Obsidian API (D7).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

const WEEKDAY_INDEX: Record<string, number> = {
	sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
	thursday: 4, friday: 5, saturday: 6,
};

/**
 * Does the `remind` schedule allow the activity to be shown on `today`?
 *
 * @param remind    raw frontmatter value; blank/unknown means "always"
 * @param today     YYYY-MM-DD
 * @param dayOfWeek 0=Sunday … 6=Saturday, for `today`
 */
export function remindAllowsDate(
	remind: string | null | undefined,
	today: string,
	dayOfWeek: number
): boolean {
	const value = (remind ?? '').trim().toLowerCase();
	if (!value || value === 'daily') return true;

	if (value === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
	if (value === 'weekends') return dayOfWeek === 0 || dayOfWeek === 6;

	const weekday = WEEKDAY_INDEX[value];
	if (weekday !== undefined) return dayOfWeek === weekday;

	// YYYY-MM or YYYY-MM-DD — show only from that date onward
	if (DATE_RE.test(value)) return today >= value;
	if (MONTH_RE.test(value)) return today >= `${value}-01`;

	return true;
}

/** Is the activity still snoozed on `today`? */
export function isSnoozed(snoozeUntil: string | null | undefined, today: string): boolean {
	const value = (snoozeUntil ?? '').trim();
	if (!DATE_RE.test(value)) return false;
	return today < value;
}

/** Day-of-week index for a YYYY-MM-DD string, in UTC to match the date itself. */
export function dayOfWeekFor(date: string): number {
	return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Combined matrix visibility check for the two scheduling fields. */
export function scheduleAllowsToday(
	remind: string | null | undefined,
	snoozeUntil: string | null | undefined,
	today: string
): boolean {
	if (isSnoozed(snoozeUntil, today)) return false;
	return remindAllowsDate(remind, today, dayOfWeekFor(today));
}
