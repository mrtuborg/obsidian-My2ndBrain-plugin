/**
 * Single source of truth for the `takeToWork` planning flag.
 *
 * `takeToWork` is the mandatory boolean on every Activity that decides whether
 * it appears in the daily note's activities section. It is set deliberately —
 * normally by clicking a button in the Eisenhower Matrix — rather than being
 * inferred from schedules.
 *
 * `takeToWorkDate` is an optional YYYY-MM-DD companion. It is **matrix
 * metadata only**: it drives ordering/display in the matrix and never affects
 * which activities land in a daily note.
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
