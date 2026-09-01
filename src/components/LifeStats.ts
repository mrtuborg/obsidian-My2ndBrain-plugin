/**
 * Long-run stats over your journal. No Obsidian API (D7).
 *
 * Everything here is derived from what the vault already knows about journal
 * files *without opening them* — the date in the filename, which role Context
 * pages sit beside a daily note, and the note's size on disk. Home renders on
 * every open, so a year of history has to cost nothing; reading 365 notes to
 * draw two small charts would make the landing page the slowest note in the
 * vault.
 *
 * That constraint shapes what the numbers can honestly mean:
 *  - a role's attention is "days that role showed up in your journal", which
 *    is a Context page existing for it that day;
 *  - a day's depth is how much you wrote that day, relative to your own
 *    typical day.
 */

export interface JournalDay {
	date: string;
	/** Roles that have a Context page for this date. */
	roles: string[];
	/** Size of the daily note on disk, in bytes. */
	size: number;
}

export interface RoleBalance {
	role: string;
	/** Days in the window this role showed up. */
	days: number;
	/**
	 * 0..1 against the busiest role — the radar plots balance, not volume, so
	 * a round shape means your roles get comparable attention whether the year
	 * was busy or quiet.
	 */
	ratio: number;
}

export interface LifeBalance {
	roles: RoleBalance[];
	windowDays: number;
	/** Days the busiest role showed up — the outer ring of the radar. */
	peak: number;
	/** Mean ratio: the reference ring a perfectly balanced year would trace. */
	mean: number;
	/** False when nothing has been recorded yet, so the UI can explain instead of drawing a dot. */
	hasData: boolean;
}

export interface ConsistencyDay {
	date: string;
	/** 0 = no daily note, 1 = a thin one, up to 4 = one of your fullest days. */
	level: 0 | 1 | 2 | 3 | 4;
	roles: number;
	size: number;
}

export interface Consistency {
	/** Columns of 7, Sunday-first. `null` pads the partial weeks at each end. */
	weeks: (ConsistencyDay | null)[][];
	/** Labels for the columns where a new month starts. */
	monthLabels: Array<{ week: number; label: string }>;
	/** Consecutive days up to today. Today not being written yet doesn't break it. */
	currentStreak: number;
	longestStreak: number;
	activeDays: number;
	windowDays: number;
}

const MS_PER_DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDate(iso: string): Date {
	return new Date(iso + 'T00:00:00Z');
}

function toIso(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function shift(iso: string, days: number): string {
	return toIso(new Date(toDate(iso).getTime() + days * MS_PER_DAY));
}

/** Days strictly inside the window ending on `today`, most recent last. */
function inWindow(days: JournalDay[], today: string, windowDays: number): JournalDay[] {
	const first = shift(today, -(windowDays - 1));
	return days.filter(d => d.date >= first && d.date <= today);
}

/**
 * How much attention each role got over the window. Roles are reported in the
 * order given, always all of them — a role with nothing is the single most
 * useful thing this chart can tell you, so it must still get an axis.
 */
export function buildLifeBalance(
	today: string,
	days: JournalDay[],
	roles: readonly string[],
	windowDays = 365
): LifeBalance {
	const window = inWindow(days, today, windowDays);

	const counts = roles.map(role => ({
		role,
		days: window.filter(d => d.roles.includes(role)).length,
	}));
	const peak = counts.reduce((max, c) => Math.max(max, c.days), 0);

	const withRatio: RoleBalance[] = counts.map(c => ({
		...c,
		ratio: peak === 0 ? 0 : c.days / peak,
	}));
	const mean = withRatio.length === 0
		? 0
		: withRatio.reduce((sum, r) => sum + r.ratio, 0) / withRatio.length;

	return { roles: withRatio, windowDays, peak, mean, hasData: peak > 0 };
}

/**
 * Levels are quantiles of your *own* days, not fixed byte counts. A template
 * that grows, or a month of short entries, would make absolute thresholds
 * lie; relative ones keep answering the question actually being asked —
 * was this a full day for me, or a thin one.
 */
function levelFor(size: number, roles: number, breaks: number[]): ConsistencyDay['level'] {
	let level = 1;
	for (const b of breaks) if (size >= b) level++;
	// A day split across several role contexts was a day you worked broadly.
	if (roles >= 2) level++;
	return Math.min(4, level) as ConsistencyDay['level'];
}

function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return 0;
	const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
	return sorted[idx]!;
}

export function buildConsistency(
	today: string,
	days: JournalDay[],
	windowDays = 364
): Consistency {
	const window = inWindow(days, today, windowDays);
	const byDate = new Map(window.map(d => [d.date, d]));

	const sizes = window.map(d => d.size).sort((a, b) => a - b);
	const breaks = [quantile(sizes, 0.4), quantile(sizes, 0.75)];

	// Start on the Sunday on or before the window's first day so the grid has
	// clean weekday rows, the way a calendar reads.
	const first = shift(today, -(windowDays - 1));
	const start = shift(first, -toDate(first).getUTCDay());
	const columns = Math.ceil((toDate(today).getTime() - toDate(start).getTime()) / MS_PER_DAY / 7) + 1;

	const weeks: (ConsistencyDay | null)[][] = [];
	const monthLabels: Array<{ week: number; label: string }> = [];
	let lastMonth = -1;

	for (let w = 0; w < columns; w++) {
		const column: (ConsistencyDay | null)[] = [];
		for (let d = 0; d < 7; d++) {
			const date = shift(start, w * 7 + d);
			if (date < first || date > today) {
				column.push(null);
				continue;
			}
			const entry = byDate.get(date);
			column.push({
				date,
				roles: entry?.roles.length ?? 0,
				size: entry?.size ?? 0,
				level: entry ? levelFor(entry.size, entry.roles.length, breaks) : 0,
			});
		}
		weeks.push(column);

		// Labelled by the month the column's first in-window day falls in, the
		// way a calendar header reads. A month whose first week is only a day
		// or two long borrows the previous label rather than crowding it.
		const monthOf = column.find((c): c is ConsistencyDay => c !== null);
		if (monthOf) {
			const month = toDate(monthOf.date).getUTCMonth();
			if (month !== lastMonth) {
				monthLabels.push({ week: w, label: MONTHS[month]! });
				lastMonth = month;
			}
		}
	}

	return {
		weeks,
		monthLabels,
		currentStreak: currentStreak(today, byDate),
		longestStreak: longestStreak(window),
		activeDays: window.length,
		windowDays,
	};
}

/**
 * Counted back from today, but today missing doesn't end it — at 9am you
 * haven't written today's note yet, and a streak that resets every morning
 * would only ever punish you for being early.
 */
function currentStreak(today: string, byDate: Map<string, JournalDay>): number {
	let cursor = byDate.has(today) ? today : shift(today, -1);
	let streak = 0;
	while (byDate.has(cursor)) {
		streak++;
		cursor = shift(cursor, -1);
	}
	return streak;
}

function longestStreak(window: JournalDay[]): number {
	const dates = window.map(d => d.date).sort();
	let best = 0;
	let run = 0;
	let previous = '';
	for (const date of dates) {
		run = previous && shift(previous, 1) === date ? run + 1 : 1;
		best = Math.max(best, run);
		previous = date;
	}
	return best;
}
