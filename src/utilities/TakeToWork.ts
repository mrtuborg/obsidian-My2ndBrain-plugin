/**
 * Single source of truth for the `takeToWork` planning flag.
 *
 * `takeToWork` is the mandatory boolean on every Activity that decides whether
 * it appears in the daily note's activities section. It is set deliberately —
 * normally by clicking a button in the Eisenhower Matrix — rather than being
 * inferred from schedules.
 *
 * `takeToWorkDate` is an optional YYYY-MM-DD companion: the day the user
 * intends to pick the activity up. It is a one-shot alarm — when that day
 * arrives the activity is taken to work automatically and the date is
 * cleared. Until then it only affects ordering in the matrix.
 *
 * Pure logic, no Obsidian API (D7).
 */

export const TAKE_TO_WORK_FIELD = 'takeToWork';
export const TAKE_TO_WORK_DATE_FIELD = 'takeToWorkDate';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Value to use for an activity whose `takeToWork` field is missing.
 *
 * Before the backfill has run, hundreds of pre-existing activities have no
 * field at all. Deriving it from the stage keeps the daily note behaving
 * exactly as it did previously, so the migration is not a hard cutover.
 */
export function deriveTakeToWork(stage: string | null | undefined): boolean {
	return (stage ?? '').trim() === 'doing';
}

/**
 * Resolve the effective flag: explicit value when present, derived otherwise.
 */
export function resolveTakeToWork(
	explicit: boolean | null | undefined,
	stage: string | null | undefined
): boolean {
	return explicit ?? deriveTakeToWork(stage);
}

/** Normalise a raw takeToWorkDate value: a valid YYYY-MM-DD, or ''. */
export function normalizeTakeToWorkDate(raw: string | null | undefined): string {
	const value = (raw ?? '').trim();
	return DATE_RE.test(value) ? value : '';
}

/**
 * Whether a planned date has come due — i.e. it is today or already past.
 *
 * The date is a one-shot alarm, not a standing rule: when it fires, the
 * activity is taken to work and the date is cleared. Leaving it in place
 * would re-take the activity on every render, so dropping it would be
 * impossible for as long as the date stayed in the past.
 */
export function planDateHasArrived(
	raw: string | null | undefined,
	today: string
): boolean {
	const date = normalizeTakeToWorkDate(raw);
	return date !== '' && date <= today;
}
