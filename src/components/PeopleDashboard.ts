/**
 * Rolls commitments up per person for the People dashboard. No Obsidian API (D7).
 *
 * The Projects dashboard answers "which project needs a decision". This
 * answers the same question about people: who is owed something, who owes me
 * something, and who have I quietly stopped talking to. Ordering matters more
 * than the counts — a list of everyone you know sorted alphabetically is an
 * address book, not a dashboard.
 */

import { Commitment, ContactStat, Direction, UNASSIGNED, daysBetween } from './Commitments';

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
 * Days of contact a person needs before their silence is worth reporting.
 *
 * Someone named once eighteen months ago is not a relationship that lapsed —
 * they are a name that came up. Without this floor the "gone quiet" list fills
 * with one-off mentions and the genuine lapses are lost in it.
 *
 * Two, not more: this journal links people sparingly — the most-mentioned
 * person in four hundred notes appears on nine days — so a higher floor
 * silences the very relationships the page exists to catch.
 */
export const HISTORY_DAYS = 2;

/**
 * What this person needs from you, in the order a review should consider it.
 * Same idea as ProjectHealth — the state is what the dashboard sorts and
 * colours by, because a row of numbers alone never says who to deal with first.
 *
 * The two contact states exist because this vault had no promise tags at all
 * when the dashboard shipped, and a page that says nothing until you adopt a
 * new syntax teaches you only to stop opening it. Contact recency is derived
 * from links that are already there, so the dashboard is useful on day one and
 * gets sharper as promises are tagged.
 */
export type PersonHealth =
	/** An open promise has passed the aging threshold. Deal with this first. */
	| 'aging'
	/** Open promises, none of them old yet. */
	| 'open'
	/** Real history, no page archive, and nothing in QUIET_DAYS. A lapse. */
	| 'quiet'
	/** Mentioned within QUIET_DAYS. A live relationship. */
	| 'active'
	/** Archived, or too thin a history to read anything into the silence. */
	| 'dormant';

const HEALTH_RANK: Record<PersonHealth, number> = {
	aging: 0,
	open: 1,
	quiet: 2,
	active: 3,
	dormant: 4,
};

export const PERSON_HEALTH_LABEL: Record<PersonHealth, string> = {
	aging: 'Aging',
	open: 'Open',
	quiet: 'Quiet',
	active: 'Active',
	dormant: 'Dormant',
};

export const PERSON_HEALTH_HINT: Record<PersonHealth, string> = {
	aging: `Something has been open longer than ${AGING_DAYS} days`,
	open: 'Open promises, none of them old yet',
	quiet: `No mention in the last ${QUIET_DAYS} days`,
	active: `Mentioned in the last ${QUIET_DAYS} days`,
	dormant: 'Archived, or barely mentioned',
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
	/** Journal days mentioning them — the weight of the relationship. */
	days: number;
	/** First journal date they were mentioned on. '' if never. */
	firstSeen: string;
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
	active: number;
	quiet: number;
	missingPages: number;
}

export interface PeopleDashboardInput {
	commitments: Commitment[];
	/** Person → how often and how recently the journal mentions them. */
	contact: Map<string, ContactStat>;
	pages: PersonPage[];
	today: string;
}

function healthOf(
	open: number,
	oldestOpen: number,
	daysSinceSeen: number | null,
	days: number,
	archived: boolean
): PersonHealth {
	if (oldestOpen >= AGING_DAYS) return 'aging';
	if (open > 0) return 'open';
	if (daysSinceSeen === null) return 'dormant';
	if (daysSinceSeen < QUIET_DAYS) return 'active';
	// An archived person is not "quiet" — you filed them on purpose, and
	// nagging about a relationship you deliberately closed is noise. Neither
	// is someone you barely mentioned: there was no rhythm to break.
	return !archived && days >= HISTORY_DAYS ? 'quiet' : 'dormant';
}

export class PeopleDashboard {

	buildRows(input: PeopleDashboardInput): PersonRow[] {
		const { commitments, contact, pages, today } = input;

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
		for (const name of contact.keys()) remember(name);
		for (const c of commitments) groups.get(remember(c.person))!.push(c);

		const contactByKey = new Map<string, ContactStat>();
		for (const [name, stat] of contact) contactByKey.set(name.toLowerCase(), stat);

		const rows: PersonRow[] = [];
		for (const [key, group] of groups.entries()) {
			const name = displayName.get(key)!;
			const page = pageByName.get(key) ?? null;
			const stat = contactByKey.get(key) ?? null;
			const seen = stat?.lastSeen ?? '';
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
				days: stat?.days ?? 0,
				firstSeen: stat?.firstSeen ?? '',
				lastSeen: seen,
				daysSinceSeen,
				health: isBucket
					? (oldestOpen >= AGING_DAYS ? 'aging' : open.length ? 'open' : 'dormant')
					: healthOf(
						open.length, oldestOpen, daysSinceSeen,
						stat?.days ?? 0, page?.archived ?? false
					),
				commitments: commitmentRows,
			});
		}

		return rows.sort((a, b) => {
			const rank = HEALTH_RANK[a.health] - HEALTH_RANK[b.health];
			if (rank !== 0) return rank;
			if (b.oldestOpen !== a.oldestOpen) return b.oldestOpen - a.oldestOpen;
			if (b.open !== a.open) return b.open - a.open;
			// Within a contact state, the person you deal with most comes
			// first — days of contact is the closest thing to "how much this
			// relationship weighs" the journal can tell us.
			if (b.days !== a.days) return b.days - a.days;
			return a.name.localeCompare(b.name);
		});
	}

	summarize(rows: PersonRow[]): PeopleSummary {
		const people = rows.filter(r => r.name !== UNASSIGNED);
		return {
			owed: rows.reduce((n, r) => n + r.owed, 0),
			waiting: rows.reduce((n, r) => n + r.waiting, 0),
			aging: rows.reduce((n, r) => n + r.commitments.filter(c => c.aging).length, 0),
			people: people.length,
			active: people.filter(r => r.health === 'active').length,
			quiet: people.filter(r => r.health === 'quiet').length,
			missingPages: rows.filter(r => r.missingPage).length,
		};
	}
}
