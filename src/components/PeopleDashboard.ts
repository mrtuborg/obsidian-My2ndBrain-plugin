/**
 * Rolls commitments up per person for the People dashboard. No Obsidian API (D7).
 *
 * The Projects dashboard answers "which project needs a decision". This
 * answers the same question about people: who is owed something, who owes me
 * something, and who have I quietly stopped talking to. Ordering matters more
 * than the counts — a list of everyone you know sorted alphabetically is an
 * address book, not a dashboard.
 */

import { Commitment, Direction, UNASSIGNED, daysBetween } from './Commitments';

/**
 * Days an open promise can sit before it counts as aging.
 *
 * Deliberately shorter than the projects dashboard's `STALE_DAYS = 60`. A
 * project can reasonably lie fallow for two months; a promise to a person
 * that has gone unmentioned for two weeks has already cost you something,
 * even if nobody has said so.
 */
export const AGING_DAYS = 14;

/** Days without a mention before a relationship counts as having gone quiet. */
export const QUIET_DAYS = 60;

/**
 * What this person needs from you, in the order a review should consider it.
 * Same idea as ProjectHealth — the state is what the dashboard sorts and
 * colours by, because a row of numbers alone never says who to deal with first.
 */
export type PersonHealth =
	/** An open promise has passed the aging threshold. Deal with this first. */
	| 'aging'
	/** Open promises, none of them old yet. */
	| 'open'
	/** No mention in QUIET_DAYS, and a page that is not archived. */
	| 'quiet'
	/** Nothing open, seen recently. Nothing to decide. */
	| 'clear';

const HEALTH_RANK: Record<PersonHealth, number> = {
	aging: 0,
	open: 1,
	quiet: 2,
	clear: 3,
};

export const PERSON_HEALTH_LABEL: Record<PersonHealth, string> = {
	aging: 'Aging',
	open: 'Open',
	quiet: 'Quiet',
	clear: 'Clear',
};

export const PERSON_HEALTH_HINT: Record<PersonHealth, string> = {
	aging: `Something has been open longer than ${AGING_DAYS} days`,
	open: 'Open promises, none of them old yet',
	quiet: `No mention in the last ${QUIET_DAYS} days`,
	clear: 'Nothing outstanding',
};

/** A person's page, as the dashboard needs to know about it. */
export interface PersonPage {
	name: string;
	path: string;
	archived: boolean;
}

/** One commitment, with everything the view needs to draw a row. */
export interface CommitmentRow {
	direction: Direction;
	text: string;
	activity: string;
	born: string;
	done: string | null;
	/** Days open. 0 once it is done. */
	age: number;
	aging: boolean;
	path: string;
	raw: string;
}

export interface PersonRow {
	name: string;
	/** Their People page, or null when they are only ever mentioned in the journal. */
	path: string | null;
	archived: boolean;
	/** True when the journal links them but no People page exists. */
	missingPage: boolean;
	owed: number;
	waiting: number;
	open: number;
	done: number;
	oldestOpen: number;
	/** Last journal date they were mentioned on. '' if never. */
	lastSeen: string;
	/** Days since `lastSeen`. Null when they have never been mentioned. */
	daysSinceSeen: number | null;
	health: PersonHealth;
	commitments: CommitmentRow[];
}

export interface PeopleSummary {
	owed: number;
	waiting: number;
	aging: number;
	people: number;
	quiet: number;
	missingPages: number;
}

export interface PeopleDashboardInput {
	commitments: Commitment[];
	/** Person → most recent journal date mentioning them. */
	lastSeen: Map<string, string>;
	pages: PersonPage[];
	today: string;
}

function healthOf(
	open: number, oldestOpen: number, daysSinceSeen: number | null, archived: boolean
): PersonHealth {
	if (oldestOpen >= AGING_DAYS) return 'aging';
	if (open > 0) return 'open';
	// An archived person is not "quiet" — you filed them on purpose, and
	// nagging about a relationship you deliberately closed is noise.
	if (!archived && daysSinceSeen !== null && daysSinceSeen >= QUIET_DAYS) return 'quiet';
	return 'clear';
}

export class PeopleDashboard {

	buildRows(input: PeopleDashboardInput): PersonRow[] {
		const { commitments, lastSeen, pages, today } = input;

		const pageByName = new Map<string, PersonPage>();
		for (const page of pages) pageByName.set(page.name.toLowerCase(), page);

		// Everyone with a page gets a row even with nothing outstanding —
		// that is what makes "gone quiet" visible at all. Someone with no page
		// only appears once the journal actually mentions them.
		const groups = new Map<string, Commitment[]>();
		const displayName = new Map<string, string>();
		const remember = (name: string) => {
			const key = name.toLowerCase();
			if (!groups.has(key)) groups.set(key, []);
			if (!displayName.has(key)) displayName.set(key, name);
			return key;
		};

		for (const page of pages) remember(page.name);
		for (const name of lastSeen.keys()) remember(name);
		for (const c of commitments) groups.get(remember(c.person))!.push(c);

		const rows: PersonRow[] = [];
		for (const [key, group] of groups.entries()) {
			const name = displayName.get(key)!;
			const page = pageByName.get(key) ?? null;
			const seen = lastSeen.get(name) ?? '';
			const daysSinceSeen = seen ? Math.max(0, daysBetween(seen, today)) : null;

			const commitmentRows: CommitmentRow[] = group
				.map(c => {
					const age = c.done ? 0 : Math.max(0, daysBetween(c.born, today));
					return {
						direction: c.direction,
						text: c.text,
						activity: c.activity,
						born: c.born,
						done: c.done,
						age,
						aging: !c.done && age >= AGING_DAYS,
						path: c.path,
						raw: c.raw,
					};
				})
				.sort((a, b) => {
					// Open before done, then oldest first — the thing you have
					// been sitting on longest is the thing to read first.
					if (!a.done !== !b.done) return a.done ? 1 : -1;
					return a.born < b.born ? -1 : a.born > b.born ? 1 : 0;
				});

			const open = commitmentRows.filter(c => !c.done);
			const oldestOpen = open.length ? Math.max(...open.map(c => c.age)) : 0;

			// Unassigned is a bucket, not a person: it has no page, and calling
			// it "quiet" or telling you to create a page for it is nonsense.
			const isBucket = name === UNASSIGNED;

			rows.push({
				name,
				path: page?.path ?? null,
				archived: page?.archived ?? false,
				missingPage: !page && !isBucket,
				owed: open.filter(c => c.direction === 'owed').length,
				waiting: open.filter(c => c.direction === 'waiting').length,
				open: open.length,
				done: commitmentRows.length - open.length,
				oldestOpen,
				lastSeen: seen,
				daysSinceSeen,
				health: isBucket
					? (oldestOpen >= AGING_DAYS ? 'aging' : open.length ? 'open' : 'clear')
					: healthOf(open.length, oldestOpen, daysSinceSeen, page?.archived ?? false),
				commitments: commitmentRows,
			});
		}

		return rows.sort((a, b) => {
			const rank = HEALTH_RANK[a.health] - HEALTH_RANK[b.health];
			if (rank !== 0) return rank;
			if (b.oldestOpen !== a.oldestOpen) return b.oldestOpen - a.oldestOpen;
			if (b.open !== a.open) return b.open - a.open;
			return a.name.localeCompare(b.name);
		});
	}

	summarize(rows: PersonRow[]): PeopleSummary {
		return {
			owed: rows.reduce((n, r) => n + r.owed, 0),
			waiting: rows.reduce((n, r) => n + r.waiting, 0),
			aging: rows.reduce((n, r) => n + r.commitments.filter(c => c.aging).length, 0),
			people: rows.filter(r => r.name !== UNASSIGNED).length,
			quiet: rows.filter(r => r.health === 'quiet').length,
			missingPages: rows.filter(r => r.missingPage).length,
		};
	}
}
