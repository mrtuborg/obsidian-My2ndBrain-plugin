/**
 * Resolves the wikilink target of an Activity block heading to the Activity's
 * canonical vault path. Pure — takes file paths, no Obsidian API (D7).
 *
 * Obsidian rewrites headings on rename into whatever shortest form it likes:
 * `Activities/Foo.md`, `Activities/Foo`, `Foo.md` or `Foo` all name the same
 * file. Matching on the raw target made one Activity look like several.
 */
export type PathNormalizer = (target: string) => string;

function strip(target: string): string {
	return target.trim().replace(/#.*$/, '').replace(/\.md$/i, '').trim();
}

/**
 * `files` is every candidate Activity file; `folder` the configured Activities
 * folder (never hardcoded). Targets that match no file come back as
 * `<target>.md`, so spelling variants of a missing file still compare equal.
 */
export function buildPathNormalizer(files: Array<{ path: string }>, folder: string): PathNormalizer {
	const byFull = new Map<string, string>();
	const byBase = new Map<string, string | null>();
	const prefix = folder.replace(/\/+$/, '') + '/';
	for (const f of files) {
		if (!f.path.startsWith(prefix) || !/\.md$/i.test(f.path)) continue;
		const noExt = f.path.replace(/\.md$/i, '').toLowerCase();
		byFull.set(noExt, f.path);
		const base = noExt.slice(noExt.lastIndexOf('/') + 1);
		byBase.set(base, byBase.has(base) ? null : f.path);
	}

	return (target: string): string => {
		const clean = strip(target);
		const key = clean.toLowerCase();
		const direct = byFull.get(key) ?? byFull.get(prefix.toLowerCase() + key);
		if (direct) return direct;
		if (!clean.includes('/')) {
			const viaBase = byBase.get(key);
			if (viaBase) return viaBase;
		}
		return `${clean}.md`;
	};
}

/** Fallback when no file list is available: only spelling variants are unified. */
export const spellingNormalizer: PathNormalizer = target => `${strip(target)}.md`;
