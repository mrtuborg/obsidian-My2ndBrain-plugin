import { AppLike, FileIO } from './FileIO';
import {
	Commitment, CommitmentSighting, ContactStat,
	parseSightings, foldCommitments, personFrom, looksLikePerson,
} from '../components/Commitments';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What the scanner needs off a file beyond its path — Obsidian's `TFile.stat`,
 * narrowed to the one field that matters. Declared here rather than widening
 * `VaultFile`, because only this scanner cares.
 */
interface StatLike {
	path: string;
	basename: string;
	stat?: { mtime?: number };
}

/** One journal file's parsed result, plus the mtime it was parsed at. */
interface CacheEntry {
	mtime: number;
	sightings: CommitmentSighting[];
	/**
	 * Every person mentioned anywhere in the note, not just those in
	 * commitments. Cached alongside the sightings because contact recency has
	 * to survive a cache hit — deriving it from commitments alone would mean
	 * someone you talk to constantly but never promise anything reads as
	 * "gone quiet" the moment their note stops being re-read.
	 */
	mentions: string[];
}

/** The shape persisted between sessions. Versioned so a parser change can invalidate it. */
export interface CommitmentCache {
	version: number;
	entries: Record<string, CacheEntry>;
}

/**
 * Bump when the parser's output shape or semantics change, so a stale cache
 * from an older build is discarded instead of quietly serving results the
 * current code would never have produced.
 *
 * v2 dropped non-people (iteration notes, overviews, test files) from the
 * mention set, so v1 entries would keep them alive for every unchanged file.
 */
export const CACHE_VERSION = 2;

export function emptyCache(): CommitmentCache {
	return { version: CACHE_VERSION, entries: {} };
}

/** How often, and how recently, one person shows up in the journal. */
export type { ContactStat } from '../components/Commitments';

export interface ScanResult {
	commitments: Commitment[];
	/** Person → how often and how recently the journal mentions them. */
	contact: Map<string, ContactStat>;
	/** The cache to persist. Same object identity as the input when nothing changed. */
	cache: CommitmentCache;
	/** True when at least one file had to be re-read — worth persisting the cache. */
	changed: boolean;
	/** Journal files considered. Lets callers say "nothing scanned" from "nothing found". */
	scanned: number;
}

const LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

/**
 * Every name that has a page under the People folder, lowercased.
 *
 * Bare `[[Frederik Stray]]` links only resolve to a person if we already know
 * the name, so this set is what lets the parser tell a colleague apart from
 * `[[AT Commands]]`. Archived people stay in the set deliberately: they are
 * still real people, and a promise to one of them is still a promise — the
 * dashboard decides what to do about their archived status separately.
 *
 * Meeting notes and the folder's overview page are filtered out here rather
 * than downstream, so nothing that isn't a person ever enters the pipeline.
 */
export function knownPeople(app: AppLike, peopleFolder: string): Set<string> {
	const names = new Set<string>();
	for (const file of app.vault.getFiles()) {
		if (!isPersonPage(file.path, peopleFolder)) continue;
		names.add(file.basename.toLowerCase());
	}
	return names;
}

/** Whether a vault path is a People page describing an actual person. */
export function isPersonPage(path: string, peopleFolder: string): boolean {
	if (!path.startsWith(peopleFolder + '/') || !path.endsWith('.md')) return false;
	// Meetings live under People/ but are events, not attendees.
	if (/(^|\/)Meetings\//i.test(path)) return false;
	const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
	return looksLikePerson(name);
}

/** Person mentions anywhere in a note, for contact recency. */
function mentionsIn(text: string, known: ReadonlySet<string>): string[] {
	const found: string[] = [];
	LINK_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = LINK_RE.exec(text)) !== null) {
		const name = personFrom(m[1]!, known);
		if (name && !found.includes(name)) found.push(name);
	}
	return found;
}

/**
 * The journal's daily notes, excluding Context pages.
 *
 * Context pages are derived from the daily note they sit beside (D3), so
 * scanning them would count the same promise twice. Their basenames are
 * `YYYY-MM-DD-<Role>`, which the strict date test already rejects.
 */
function journalNotes(app: AppLike, journalFolder: string): StatLike[] {
	return (app.vault.getFiles() as unknown as StatLike[]).filter(f =>
		f.path.startsWith(journalFolder + '/') &&
		f.path.endsWith('.md') &&
		DATE_RE.test(f.basename)
	);
}

/**
 * Scans the journal for commitments, re-reading only what changed.
 *
 * The vault has 419 daily notes and Home re-renders on every open. The
 * LifeStats work established that Home must not read note bodies at all; this
 * feature genuinely needs them, so the compromise is that it reads each note
 * exactly once ever, and thereafter only notes whose mtime moved. A cold
 * cache costs one slow render; a warm one costs a map lookup per file.
 *
 * Only the journal is scanned. Activities and People pages mirror these same
 * lines (D1/D3), so including them would triple-count every promise.
 */
export async function scanCommitments(
	app: AppLike,
	journalFolder: string,
	peopleFolder: string,
	cache: CommitmentCache | null
): Promise<ScanResult> {
	const fileIO = new FileIO();
	const known = knownPeople(app, peopleFolder);
	const files = journalNotes(app, journalFolder);

	const usable = cache && cache.version === CACHE_VERSION ? cache : emptyCache();
	const next: Record<string, CacheEntry> = {};
	const contact = new Map<string, ContactStat>();
	const all: CommitmentSighting[] = [];
	let changed = false;

	for (const file of files) {
		const mtime = file.stat?.mtime ?? 0;
		const cached = usable.entries[file.path];

		let entry: CacheEntry;
		if (cached && cached.mtime === mtime && Array.isArray(cached.mentions)) {
			entry = cached;
		} else {
			changed = true;
			const handle = app.vault.getAbstractFileByPath(file.path);
			if (!handle) continue;

			let text: string;
			try {
				text = await app.vault.read(handle);
			} catch {
				// A file that vanished mid-scan is not worth failing the whole
				// dashboard over; it will be picked up next time.
				continue;
			}

			entry = fileIO.exceedsSizeLimit(text)
				? { mtime, sightings: [], mentions: [] }
				: {
					mtime,
					sightings: parseSightings({ path: file.path, date: file.basename, text }, known),
					mentions: mentionsIn(text, known),
				};
		}

		next[file.path] = entry;
		for (const s of entry.sightings) all.push(s);
		// One journal note is one day, so a name appearing in it — however
		// many times — is one day of contact. Counting raw link occurrences
		// instead would let a single note with a long attendee list outrank a
		// person mentioned every week for a year.
		for (const name of entry.mentions) {
			const date = file.basename;
			const prev = contact.get(name);
			if (!prev) {
				contact.set(name, { days: 1, firstSeen: date, lastSeen: date });
				continue;
			}
			prev.days += 1;
			if (date < prev.firstSeen) prev.firstSeen = date;
			if (date > prev.lastSeen) prev.lastSeen = date;
		}
	}

	// A file that disappeared should not linger in the cache forever.
	if (Object.keys(next).length !== Object.keys(usable.entries).length) changed = true;

	return {
		commitments: foldCommitments(all),
		contact,
		cache: { version: CACHE_VERSION, entries: next },
		changed,
		scanned: files.length,
	};
}
