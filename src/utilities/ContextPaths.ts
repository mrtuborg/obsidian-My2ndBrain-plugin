/**
 * Contexts pages always live in a "Contexts" subfolder that sits right next
 * to whatever daily note they belong to — wherever that daily note actually
 * is (e.g. "Journal/2026-08-12.md" or, with a dated Daily Notes folder
 * format, "Journal/2026/08.August/2026-08-12.md"). Rather than a fixed
 * setting, this is derived structurally per daily note so it always follows
 * the note, at any nesting depth.
 */

/** Returns the directory portion of a file path, or '' if it's at the root. */
export function dirOf(path: string): string {
	const idx = path.lastIndexOf('/');
	return idx === -1 ? '' : path.slice(0, idx);
}

/** The Contexts folder that sits alongside the given daily note's own file. */
export function contextsFolderForNote(dailyNotePath: string): string {
	const dir = dirOf(dailyNotePath);
	return dir ? `${dir}/Contexts` : 'Contexts';
}

/**
 * Structurally detects a Contexts page — a file at ".../Contexts/<Role>/YYYY-MM-DD.md"
 * inside `journalFolder`'s tree (at any nesting depth) — and returns its role,
 * or null if `path` isn't one. Doesn't depend on any single fixed Contexts
 * location, since each daily note's Contexts folder can sit at a different
 * depth (e.g. a new month folder).
 */
export function matchContextPagePath(
	path: string,
	journalFolder: string,
	roles: readonly string[]
): string | null {
	if (!path.startsWith(journalFolder + '/')) return null;

	const segments = path.split('/');
	if (segments.length < 3) return null;

	const filename = segments[segments.length - 1]!;
	const role = segments[segments.length - 2]!;
	const contextsSegment = segments[segments.length - 3]!;

	if (contextsSegment !== 'Contexts') return null;
	if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(filename)) return null;
	if (!roles.includes(role)) return null;

	return role;
}
