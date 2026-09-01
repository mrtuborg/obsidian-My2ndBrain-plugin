/**
 * Promises in both directions, mined from the journal. No Obsidian API (D7).
 *
 * The vault had no convention for this before — `action:` appeared four times
 * in one file, and every "promise" in the vault turned out to be
 * `Promise.all` inside a legacy Dataview block. So this parses a convention
 * that is being introduced, not one being recovered: two inline tags on an
 * ordinary todo line.
 *
 *     - [ ] Send the BOM @owed [[Ida Haugland]]      ← I owe them
 *     - [ ] Radio spec @waiting [[Frederik Stray]]   ← they owe me
 *
 * The tags are terse because you type them mid-sentence while journaling; the
 * labels the dashboard shows are spelled out, because that is the side you
 * read.
 *
 * Only the journal is ever scanned. Activities and People pages are derived
 * views of the same lines (D1/D3), so including them would count every
 * promise two or three times.
 */

/** Which way the obligation points. */
export type Direction = 'owed' | 'waiting';

/** How the dashboard says it out loud. Terse to type, explicit to read. */
export const DIRECTION_LABEL: Record<Direction, string> = {
	owed: 'I owe',
	waiting: 'Waiting on',
};

/**
 * Shown for a commitment whose line named nobody and sat under no heading
 * that did. Kept rather than dropped (D9): a promise you forgot to address is
 * still a promise, and silently discarding it is the one behaviour that would
 * make the dashboard untrustworthy.
 */
export const UNASSIGNED = 'Unassigned';

/** A journal file, already read. */
export interface JournalSource {
	/** Vault path, for jumping back to the line. */
	path: string;
	/** The note's date — where a commitment found here is born. */
	date: string;
	text: string;
}

/** One `@owed`/`@waiting` line, as found in one note on one day. */
export interface CommitmentSighting {
	direction: Direction;
	/** The line with the tag and person links stripped — what was actually promised. */
	text: string;
	/** Everyone this is owed to/from. Empty means unassigned. */
	people: string[];
	/** Enclosing `##### [[Activities/X]]` section, '' if the line sat outside one. */
	activity: string;
	done: boolean;
	date: string;
	path: string;
	/** The raw line, so a writer can match it before editing it. */
	raw: string;
}

/** One promise, resolved across every day it appeared. */
export interface Commitment {
	direction: Direction;
	text: string;
	person: string;
	activity: string;
	/** Date first seen open, or first seen at all if it arrived already done. */
	born: string;
	/** First date it was checked off. null while still open. */
	done: string | null;
	/** Where to jump to — the note it was last seen in. */
	path: string;
	raw: string;
}

const TAG_RE = /@(owed|waiting)\b/i;
const TODO_RE = /^\s*[-*]\s*\[( |x|X)\]\s*(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

/**
 * A link is a person if it points into the People folder, or is a bare name
 * that matches a known person. The vault contains all three spellings —
 * `[[Frederik Stray]]`, `[[People/Frederik Stray]]` and archived people under
 * `People/Archive/` — and missing any one of them would silently lose about
 * half the mentions.
 */
function personFrom(target: string, known: ReadonlySet<string>): string | null {
	const trimmed = target.trim();
	if (!trimmed) return null;

	const name = trimmed.replace(/\.md$/i, '').replace(/^.*\//, '');
	const isPeoplePath = /(^|\/)People\//i.test(trimmed);

	if (isPeoplePath) return name;
	return known.has(name.toLowerCase()) ? name : null;
}

function peopleIn(line: string, known: ReadonlySet<string>): string[] {
	const found: string[] = [];
	LINK_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = LINK_RE.exec(line)) !== null) {
		const person = personFrom(m[1]!, known);
		if (person && !found.includes(person)) found.push(person);
	}
	return found;
}

/** The `[[Activities/X]]` a `##### ...` heading points at, if it points at one. */
function activityIn(line: string): string {
	LINK_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = LINK_RE.exec(line)) !== null) {
		const target = m[1]!.trim();
		if (/^Activities\//i.test(target)) {
			return target.replace(/\.md$/i, '').replace(/^Activities\//i, '');
		}
	}
	return '';
}

/**
 * Strips the tag and the person links, leaving the promise itself. Without
 * this the same commitment written `@owed [[Ida]]` one day and
 * `[[Ida]] @owed` the next would be two different promises, and every
 * carry-forward would reset its age.
 */
function cleanText(body: string): string {
	return body
		.replace(TAG_RE, ' ')
		.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_full, target: string, alias?: string) =>
			alias ?? target.replace(/^.*\//, '')
		)
		.replace(/\s{2,}/g, ' ')
		.trim();
}

/**
 * Every tagged line in one note, with its person and activity resolved.
 *
 * A heading passes its people down to the lines beneath it, because
 * `### Infrastructure planning [[Andre Kleven]] [[Frederik Stray]]` with items
 * underneath is a shape already in the vault — the person is stated once and
 * the items below are all about them. A deeper heading replaces a shallower
 * one's people; a sibling heading with no people clears them, rather than
 * letting a name leak into an unrelated section further down the note.
 */
export function parseSightings(
	source: JournalSource,
	knownPeople: ReadonlySet<string>
): CommitmentSighting[] {
	const out: CommitmentSighting[] = [];
	// Depth → people stated by the heading at that depth.
	const headingPeople = new Map<number, string[]>();
	let activity = '';

	for (const raw of source.text.split('\n')) {
		const heading = HEADING_RE.exec(raw);
		if (heading) {
			const depth = heading[1]!.length;
			const title = heading[2]!;

			for (const d of [...headingPeople.keys()]) {
				if (d >= depth) headingPeople.delete(d);
			}
			const named = peopleIn(title, knownPeople);
			if (named.length > 0) headingPeople.set(depth, named);

			const linkedActivity = activityIn(title);
			// An activity heading opens a section; any other heading at the same
			// level or shallower closes it.
			if (linkedActivity) activity = linkedActivity;
			else if (depth <= 5) activity = '';
			continue;
		}

		const todo = TODO_RE.exec(raw);
		if (!todo) continue;

		const body = todo[2]!;
		const tag = TAG_RE.exec(body);
		if (!tag) continue;

		const inherited = [...headingPeople.entries()]
			.sort((a, b) => b[0] - a[0])
			.map(([, names]) => names)[0] ?? [];
		const onLine = peopleIn(body, knownPeople);

		out.push({
			direction: tag[1]!.toLowerCase() as Direction,
			text: cleanText(body),
			people: onLine.length > 0 ? onLine : inherited,
			activity,
			done: todo[1]!.toLowerCase() === 'x',
			date: source.date,
			path: source.path,
			raw,
		});
	}

	return out;
}

/**
 * Folds every sighting into one commitment per promise per person.
 *
 * Same rule the activity pipeline already uses (D4): only the introduction
 * and the completion of a promise are events. A todo carried forward across
 * fourteen daily notes is one promise fourteen days old, not fourteen
 * promises — and its age is measured from the first sighting, so carrying it
 * forward can never quietly reset the clock.
 *
 * A line naming two people becomes one commitment for each of them, which is
 * what promising the same thing to two people means.
 */
export function foldCommitments(sightings: CommitmentSighting[]): Commitment[] {
	const byKey = new Map<string, Commitment>();

	const chronological = [...sightings].sort((a, b) =>
		a.date < b.date ? -1 : a.date > b.date ? 1 : 0
	);

	for (const s of chronological) {
		const people = s.people.length > 0 ? s.people : [UNASSIGNED];
		for (const person of people) {
			const key = `${s.direction}\u0000${person.toLowerCase()}\u0000${s.text.toLowerCase()}`;
			const existing = byKey.get(key);

			if (!existing) {
				byKey.set(key, {
					direction: s.direction,
					text: s.text,
					person,
					activity: s.activity,
					born: s.date,
					done: s.done ? s.date : null,
					path: s.path,
					raw: s.raw,
				});
				continue;
			}

			// Later sightings can complete it and can tell us where it lives
			// now, but never move its birthday.
			if (s.done && !existing.done) existing.done = s.date;
			if (!s.done) {
				existing.path = s.path;
				existing.raw = s.raw;
			}
			if (!existing.activity && s.activity) existing.activity = s.activity;
		}
	}

	return [...byKey.values()];
}

const MS_PER_DAY = 86_400_000;

/** Whole days between two ISO dates. Negative if `to` precedes `from`. */
export function daysBetween(from: string, to: string): number {
	const a = Date.parse(from + 'T00:00:00Z');
	const b = Date.parse(to + 'T00:00:00Z');
	if (Number.isNaN(a) || Number.isNaN(b)) return 0;
	return Math.round((b - a) / MS_PER_DAY);
}

/** How long an open promise has been open. Closed ones don't age. */
export function ageOf(commitment: Commitment, today: string): number {
	if (commitment.done) return 0;
	return Math.max(0, daysBetween(commitment.born, today));
}
