/**
 * The communication checklist: who you have not spoken to lately, and who you
 * have deliberately stopped tracking. No Obsidian API (D7).
 *
 * This is a *view* over `PeopleDashboard` rows, not a second source of truth.
 * The People dashboard already derives `lastSeen` from journal links via the
 * mtime-cached scan in `CommitmentIndex`, and re-deriving it here would mean
 * two answers to "when did I last talk to them" that drift apart.
 *
 * Two things the dashboard has no opinion on are added:
 *
 *  - A tri-state the *user* sets, rather than one inferred from silence. The
 *    dashboard can only guess from behaviour, so it calls a lapsed friendship
 *    and a colleague who changed jobs the same thing. Only you know which is
 *    which, and a checklist that keeps nagging about the second one is a
 *    checklist you stop reading.
 *
 *  - An ordering by silence rather than by promise age. The dashboard sorts by
 *    what is owed; this sorts by who you have not spoken to, because those are
 *    genuinely different reviews and collapsing them loses one of them.
 *
 * Contact is logged by appending a link to today's daily note, never by
 * stamping a date on the person's page. The journal is the temporal truth
 * (D1), a person's page is a derived view (D3), and `MentionsProcessor`
 * rewrites its `## Journal` section wholesale — anything written there is
 * erased on the next open.
 */

/** Where a contact sits in your attention, as you filed them — not as inferred. */
export type ContactStatus =
	/** In the rotation. Shows on Home and is chased when they go quiet. */
	| 'active'
	/** Not right now. Kept out of the way, still one click from returning. */
	| 'inactive'
	/** Filed. Behind a fold, never chased. */
	| 'archived';

export const CONTACT_STATUSES: readonly ContactStatus[] = ['active', 'inactive', 'archived'];

/** Frontmatter key on the People page. Survives `ActivityComposer` rewrites. */
export const CONTACT_STATUS_FIELD = 'contactStatus';

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
	active: 'Active',
	inactive: 'Inactive',
	archived: 'Archived',
};

/**
 * Days of silence before a contact is worth flagging.
 *
 * Deliberately far shorter than `PeopleDashboard.QUIET_DAYS = 60`. That
 * threshold answers "has this relationship lapsed", which is a question you
 * want answered rarely and confidently. This one answers "who should I reach
 * out to this week", which is only useful if it fires while there is still
 * something easy to say.
 */
export const DEFAULT_OVERDUE_DAYS = 30;

/**
 * Reads a status off whatever the frontmatter happens to hold.
 *
 * `pathArchived` carries the convention that predates this field — people
 * filed under `People/Archive/`. Moving those files to add a frontmatter key
 * would rewrite history in every journal note that links them, so the path is
 * honoured as an archived default that an explicit field can still override.
 * That override is what makes "move back to active" work without moving files.
 */
export function normalizeStatus(raw: unknown, pathArchived = false): ContactStatus {
	if (typeof raw === 'string') {
		const value = raw.trim().toLowerCase();
		if ((CONTACT_STATUSES as readonly string[]).includes(value)) {
			return value as ContactStatus;
		}
	}
	return pathArchived ? 'archived' : 'active';
}

/** The subset of a `PersonRow` the checklist needs. Keeps this file testable. */
export interface ChecklistSource {
	name: string;
	path: string | null;
	missingPage: boolean;
	owed: number;
	waiting: number;
	days: number;
	lastSeen: string;
	daysSinceSeen: number | null;
}

export interface ChecklistEntry {
	name: string;
	/** Always set — entries without a People page are dropped, see `build`. */
	path: string;
	status: ContactStatus;
	lastSeen: string;
	daysSinceSeen: number | null;
	/** True when today's daily note already links them. */
	loggedToday: boolean;
	owed: number;
	waiting: number;
	overdue: boolean;
	/** Silence, for sorting. `Infinity` when they have never been mentioned. */
	silence: number;
}

export interface Checklist {
	active: ChecklistEntry[];
	inactive: ChecklistEntry[];
	archived: ChecklistEntry[];
	/** Active contacts past the overdue threshold. */
	overdue: number;
	/** Active contacts already logged today. */
	logged: number;
}

export interface ChecklistInput {
	rows: readonly ChecklistSource[];
	/** Person page path → the status filed against it. */
	statusOf: (path: string) => ContactStatus;
	overdueAfterDays: number;
	today: string;
	/** Names to exclude outright — the `UNASSIGNED` bucket, mostly. */
	exclude?: ReadonlySet<string>;
}

export class ContactChecklist {

	/**
	 * Groups every person with a page into the three lists Home renders.
	 *
	 * People the journal mentions but the vault has no page for are dropped:
	 * a status has to be stored somewhere, and with no file there is nowhere
	 * to put it. The People dashboard already offers to create their page,
	 * and they join the checklist once it exists.
	 */
	build(input: ChecklistInput): Checklist {
		const { rows, statusOf, today, exclude } = input;
		const threshold = Math.max(1, Math.floor(input.overdueAfterDays) || DEFAULT_OVERDUE_DAYS);

		const active: ChecklistEntry[] = [];
		const inactive: ChecklistEntry[] = [];
		const archived: ChecklistEntry[] = [];

		for (const row of rows) {
			if (!row.path || row.missingPage) continue;
			if (exclude?.has(row.name)) continue;

			const status = statusOf(row.path);
			const silence = row.daysSinceSeen === null ? Infinity : Math.max(0, row.daysSinceSeen);
			const loggedToday = row.lastSeen !== '' && row.lastSeen === today;

			const entry: ChecklistEntry = {
				name: row.name,
				path: row.path,
				status,
				lastSeen: row.lastSeen,
				daysSinceSeen: row.daysSinceSeen,
				loggedToday,
				owed: row.owed,
				waiting: row.waiting,
				// Only active contacts can be overdue. Filing someone as
				// inactive is precisely the statement "their silence is fine",
				// so counting it against them would ignore what you just said.
				overdue: status === 'active' && silence >= threshold,
				silence,
			};

			if (status === 'archived') archived.push(entry);
			else if (status === 'inactive') inactive.push(entry);
			else active.push(entry);
		}

		return {
			active: this.sort(active),
			inactive: this.sort(inactive),
			archived: this.sort(archived),
			overdue: active.filter(e => e.overdue).length,
			logged: active.filter(e => e.loggedToday).length,
		};
	}

	/**
	 * Longest silence first — the checklist's whole argument is that the
	 * person you have not thought about is the person to think about.
	 *
	 * Someone already logged today sinks to the bottom regardless. They are
	 * done; leaving them at the top because their history is thin would put a
	 * finished item above an outstanding one.
	 */
	private sort(entries: ChecklistEntry[]): ChecklistEntry[] {
		return entries.sort((a, b) => {
			if (a.loggedToday !== b.loggedToday) return a.loggedToday ? 1 : -1;
			if (a.silence !== b.silence) return b.silence - a.silence;
			return a.name.localeCompare(b.name);
		});
	}

	/**
	 * How long since contact, in the shortest form that stays unambiguous.
	 * `null` days means a page exists for someone the journal never names.
	 */
	age(daysSinceSeen: number | null): string {
		if (daysSinceSeen === null) return 'never';
		if (daysSinceSeen <= 0) return 'today';
		if (daysSinceSeen === 1) return 'yesterday';
		if (daysSinceSeen < 7) return `${daysSinceSeen}d`;
		if (daysSinceSeen < 60) return `${Math.round(daysSinceSeen / 7)}w`;
		if (daysSinceSeen < 365) return `${Math.round(daysSinceSeen / 30)}mo`;
		const years = daysSinceSeen / 365;
		return `${years < 10 ? years.toFixed(1) : Math.round(years)}y`;
	}

	/** The full sentence, for a tooltip where there is room to be clear. */
	hint(entry: ChecklistEntry): string {
		const parts: string[] = [];
		parts.push(entry.daysSinceSeen === null
			? 'Never mentioned in the journal'
			: entry.daysSinceSeen === 0
				? 'Mentioned in today\'s note'
				: `Last mentioned ${entry.lastSeen} (${entry.daysSinceSeen} days ago)`);
		if (entry.owed > 0) parts.push(`${entry.owed} you owe`);
		if (entry.waiting > 0) parts.push(`${entry.waiting} waiting on them`);
		return parts.join(' · ');
	}

	/**
	 * The line appended to today's note when a contact is checked off.
	 *
	 * A plain bullet, not a task: it records something that happened, and a
	 * checkbox would invite the daily-note pipeline to carry it forward
	 * forever. The `[[link]]` is the entire point — it is what the journal
	 * scan reads back as contact, so this needs no storage of its own.
	 */
	contactLogLine(name: string): string {
		return `- Talked to [[${name}]]`;
	}

	/**
	 * Appends the line unless it is already there.
	 *
	 * The existing note is preserved byte for byte — no trimming. A trailing
	 * blank line can be deliberate, and two trailing spaces are Markdown's
	 * hard line break, so "tidying" the end of someone's journal entry as a
	 * side effect of ticking a checkbox would be an edit they did not ask for.
	 *
	 * Idempotent because the button is on a live view that can be clicked
	 * twice before the first render lands, and because a mention is a
	 * yes/no fact about a day — logging it twice says nothing new.
	 */
	appendContactLog(content: string, line: string): string | null {
		if (content.split('\n').some(l => l.trim() === line)) return null;
		const separator = content === '' || content.endsWith('\n') ? '' : '\n';
		return `${content}${separator}${line}\n`;
	}
}
