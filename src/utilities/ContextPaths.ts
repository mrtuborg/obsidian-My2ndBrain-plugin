/**
 * Contexts pages always live in a "Contexts" subfolder that sits right next
 * to whatever daily note they belong to — wherever that daily note actually
 * is (e.g. "Journal/2026-08-12.md" or, with a dated Daily Notes folder
 * format, "Journal/2026/08.August/2026-08-12.md"). Rather than a fixed
 * setting, this is derived structurally per daily note so it always follows
 * the note, at any nesting depth.
 *
 * Context page filenames are "YYYY-MM-DD-<Role>.md" (flat, no per-role
 * subfolder) rather than a bare "YYYY-MM-DD.md" — a filename that's just a
 * date is exactly what calendar-style plugins scan for when resolving
 * "today's daily note" from anywhere in the vault. If the real daily note is
 * ever deleted, such a plugin can wrongly latch onto a same-named Contexts
 * page instead. Baking the role into the filename itself avoids that clash.
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

/** The full path of a role's context page for a given date, inside `contextsFolder`. */
export function contextPagePath(contextsFolder: string, date: string, role: string): string {
	return `${contextsFolder}/${date}-${role}.md`;
}

/**
 * Parses a "YYYY-MM-DD-<Role>.md" filename into its date and role, or
 * returns null if it doesn't match that shape or the role isn't recognized.
 */
export function parseContextPageFilename(
	filename: string,
	roles: readonly string[]
): { date: string; role: string } | null {
	const match = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/.exec(filename);
	if (!match) return null;
	const [, date, role] = match;
	if (!date || !role || !roles.includes(role)) return null;
	return { date, role };
}

/**
 * Structurally detects a Contexts page — a file at ".../Contexts/YYYY-MM-DD-<Role>.md"
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
	if (segments.length < 2) return null;

	const filename = segments[segments.length - 1]!;
	const contextsSegment = segments[segments.length - 2]!;
	if (contextsSegment !== 'Contexts') return null;

	const parsed = parseContextPageFilename(filename, roles);
	return parsed ? parsed.role : null;
}
