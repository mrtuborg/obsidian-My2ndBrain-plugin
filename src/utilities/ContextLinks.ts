const MARKER_PREFIX = '🧭 Contexts:';

/**
 * Builds the daily note's "🧭 Contexts:" link line for whichever roles
 * already have a Contexts/<date>-<Role>.md page today. Returns '' if none
 * exist yet — callers should treat that as "remove the line if present".
 */
export function buildContextLinksLine(contextsFolder: string, date: string, roles: string[]): string {
	if (roles.length === 0) return '';
	const links = roles.map(role => `[[${contextsFolder}/${date}-${role}|${role}]]`);
	return `${MARKER_PREFIX} ${links.join(' · ')}`;
}

/**
 * Idempotently inserts/replaces/removes the single "🧭 Contexts:" line in
 * `content`. Pure string operation — safe to call repeatedly (e.g. once per
 * daily-note build, and again each time a context page is created later in
 * the day) without ever touching anything else in the note.
 */
export function upsertContextLinksLine(content: string, line: string): string {
	const lines = content.split('\n');
	const idx = lines.findIndex(l => l.trim().startsWith(MARKER_PREFIX));

	if (!line) {
		if (idx === -1) return content;
		lines.splice(idx, 1);
		return lines.join('\n');
	}

	if (idx !== -1) {
		lines[idx] = line;
		return lines.join('\n');
	}

	// Insert right after a leading "# " title line, else at the very top.
	if (lines[0] && /^# /.test(lines[0])) {
		return [lines[0], '', line, ...lines.slice(1)].join('\n');
	}
	return [line, '', ...lines].join('\n');
}
