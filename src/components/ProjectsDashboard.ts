/**
 * Pure computation of the Projects Dashboard: given the current set of
 * Activities and Projects, rolls activities up per-project (done/total,
 * open-work dates) for a periodic review. No Obsidian API dependency (D7) —
 * takes plain data in, returns markdown out.
 */

// Blank `project:` and `project: inbox` both mean "not yet organized into a
// real project" — the vault already has a dedicated Projects/Inbox.md for
// exactly this, so both normalize to this slug and get matched to that real
// project below (case-insensitively), rather than a synthetic bucket.
const INBOX_SLUG = 'inbox';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Days without any dated activity before a project counts as stalled. */
export const STALE_DAYS = 60;

export interface DashboardActivity {
	path: string;
	displayName: string;
	/** Raw `project:` frontmatter value, trimmed. '' if unset. */
	project: string;
	/** Raw `role:` frontmatter value, trimmed. '' if unset. */
	role: string;
	/** Raw `stage:` frontmatter value ('doing' | 'backlog' | 'done' | other/blank). */
	stage: string;
	/** `startDate:` frontmatter value if a valid YYYY-MM-DD, else ''. */
	startDate: string;
	/** Effective `takeToWork:` flag — planned into today's daily note. */
	takeToWork?: boolean;
}

/**
 * What the project needs from the user, in the order a review should
 * consider it. A rollup of numbers alone doesn't say which projects are in
 * trouble; this does, and it's what the dashboard sorts and colours by.
 */
export type ProjectHealth =
	/** Open work, something in `doing`, touched recently. Nothing to decide. */
	| 'active'
	/** Open work and something `doing`, but nothing dated in STALE_DAYS. */
	| 'stalled'
	/** Open work but nothing in `doing` — no next action to pull from. */
	| 'no-next-action'
	/** Has activities and every one of them is done. */
	| 'complete'
	/** A project file with no activities at all. */
	| 'empty';

/** Review order: what needs a decision first, what needs nothing last. */
const HEALTH_RANK: Record<ProjectHealth, number> = {
	stalled: 0,
	'no-next-action': 1,
	active: 2,
	complete: 3,
	empty: 4,
};

/** Short, human wording for each health state — shared by both renderers. */
export const HEALTH_LABEL: Record<ProjectHealth, string> = {
	stalled: 'Stalled',
	'no-next-action': 'No next action',
	active: 'Active',
	complete: 'Complete',
	empty: 'No activities',
};

/** Why the project is in that state, for a tooltip. */
export const HEALTH_HINT: Record<ProjectHealth, string> = {
	stalled: `Open work, but nothing dated in the last ${STALE_DAYS} days`,
	'no-next-action': 'Open work, but nothing is in progress — pick a next action',
	active: 'In progress and recently touched',
	complete: 'Every activity is done',
	empty: 'No activities reference this project yet',
};

/** Whole days between two YYYY-MM-DD dates. Null if either is unparseable. */
export function daysBetween(from: string, to: string): number | null {
	if (!DATE_RE.test(from) || !DATE_RE.test(to)) return null;
	const parse = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
	return Math.round((parse(to) - parse(from)) / 86_400_000);
}

export interface DashboardProject {
	/** Matches an activity's `project:` value (folder name, or file basename without extension). */
	slug: string;
	path: string;
	role: string;
}

export interface ProjectDashboardRow {
	slug: string;
	path: string | null;
	role: string;
	total: number;
	done: number;
	doing: number;
	backlog: number;
	/** Everything not `done` — the work the project still owes. */
	open: number;
	/** Open activities already planned into today's daily note. */
	takenToday: number;
	percentDone: number;
	oldestOpenDate: string;
	latestDate: string;
	/** Days since `latestDate`. Null when the project has no dated activity. */
	daysSinceActivity: number | null;
	health: ProjectHealth;
}

export class ProjectsDashboard {

	buildRows(
		activities: DashboardActivity[],
		projects: DashboardProject[],
		today = ''
	): ProjectDashboardRow[] {
		const projectBySlug = new Map<string, DashboardProject>();
		const realSlugByLower = new Map<string, string>();
		for (const p of projects) {
			projectBySlug.set(p.slug, p);
			realSlugByLower.set(p.slug.toLowerCase(), p.slug);
		}

		const groups = new Map<string, DashboardActivity[]>();
		// Seed a group for every known project, even with zero activities —
		// surfaces stalled/dormant projects during review.
		for (const p of projects) groups.set(p.slug, []);

		for (const activity of activities) {
			const raw = activity.project.trim();
			const normalized = raw === '' ? INBOX_SLUG : raw;
			// Case-insensitively fold into a real project's canonical slug when
			// one exists (e.g. "inbox" -> the actual "Inbox" project file), so
			// it shows up as that project rather than a lookalike duplicate row.
			const key = realSlugByLower.get(normalized.toLowerCase()) ?? normalized;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(activity);
		}

		const rows: ProjectDashboardRow[] = [];
		for (const [slug, groupActivities] of groups.entries()) {
			const project = projectBySlug.get(slug);
			const total = groupActivities.length;
			const done = groupActivities.filter(a => a.stage === 'done').length;
			const doing = groupActivities.filter(a => a.stage === 'doing').length;
			const backlog = groupActivities.filter(a => a.stage === 'backlog').length;
			const percentDone = total === 0 ? 0 : Math.round((done / total) * 100);

			const openDates = groupActivities
				.filter(a => a.stage !== 'done' && DATE_RE.test(a.startDate))
				.map(a => a.startDate);
			const allDates = groupActivities
				.filter(a => DATE_RE.test(a.startDate))
				.map(a => a.startDate);

			const oldestOpenDate = openDates.length ? openDates.reduce((a, b) => (a < b ? a : b)) : '';
			const latestDate = allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : '';

			const role = project?.role || this.mostCommonRole(groupActivities);
			const open = total - done;
			const takenToday = groupActivities.filter(
				a => a.stage !== 'done' && a.takeToWork === true
			).length;
			const daysSinceActivity = today ? daysBetween(latestDate, today) : null;

			rows.push({
				slug,
				path: project?.path ?? null,
				role,
				total,
				done,
				doing,
				backlog,
				open,
				takenToday,
				percentDone,
				oldestOpenDate,
				latestDate,
				daysSinceActivity,
				health: this.healthOf(total, open, doing, daysSinceActivity),
			});
		}

		// Roles stay the primary grouping — they're how the user thinks about
		// the vault — but inside a role the order is "what needs a decision
		// first", not alphabetical. A dormant project three roles down is the
		// whole point of the review, and alphabetical order buries it.
		rows.sort((a, b) => {
			const roleA = a.role || '\uffff';
			const roleB = b.role || '\uffff';
			if (roleA !== roleB) return roleA.localeCompare(roleB);

			const rankA = HEALTH_RANK[a.health];
			const rankB = HEALTH_RANK[b.health];
			if (rankA !== rankB) return rankA - rankB;

			// Most neglected first. Undated projects sort after dated ones —
			// "no date at all" is weaker evidence than a measured gap.
			const ageA = a.daysSinceActivity ?? -1;
			const ageB = b.daysSinceActivity ?? -1;
			if (ageA !== ageB) return ageB - ageA;

			if (a.percentDone !== b.percentDone) return a.percentDone - b.percentDone;
			return a.slug.localeCompare(b.slug);
		});

		return rows;
	}

	private healthOf(
		total: number, open: number, doing: number, daysSinceActivity: number | null
	): ProjectHealth {
		if (total === 0) return 'empty';
		if (open === 0) return 'complete';
		if (daysSinceActivity !== null && daysSinceActivity >= STALE_DAYS) return 'stalled';
		if (doing === 0) return 'no-next-action';
		return 'active';
	}

	render(rows: ProjectDashboardRow[], generatedAt: string): string {
		const lines: string[] = [];
		lines.push('---');
		lines.push('---');
		lines.push('# Projects Dashboard');
		lines.push(`_Generated: ${generatedAt}_`);
		lines.push('');

		if (rows.length === 0) {
			lines.push('_No projects or activities found._');
			return lines.join('\n') + '\n';
		}

		// Projects with no activities carry no review signal and, in a real
		// vault, outnumber the ones that do. They go in one line at the end
		// rather than as a screenful of identical 0/0 rows.
		const active = rows.filter(r => r.health !== 'empty');
		const empty = rows.filter(r => r.health === 'empty');

		let currentRole: string | null = null;
		for (const row of active) {
			const roleHeading = row.role || '(no role)';
			if (roleHeading !== currentRole) {
				if (currentRole !== null) lines.push('');
				currentRole = roleHeading;
				lines.push(`## ${roleHeading}`);
				lines.push('');
				lines.push('| Project | Progress | Doing | Backlog | Today | Last activity | Status |');
				lines.push('|---|---|---|---|---|---|---|');
			}

			const progress = `${row.done}/${row.total} (${row.percentDone}%)`;
			lines.push(
				`| ${this.link(row)} | ${progress} | ${row.doing} | ${row.backlog} ` +
				`| ${row.takenToday || '—'} | ${row.latestDate || '—'} | ${HEALTH_LABEL[row.health]} |`
			);
		}

		if (empty.length) {
			lines.push('');
			lines.push(`## No activities (${empty.length})`);
			lines.push('');
			lines.push(empty.map(r => this.link(r)).join(', '));
		}

		return lines.join('\n') + '\n';
	}

	/**
	 * Wikilink to the project file, or the bare slug when no file matched.
	 * The pipe inside the alias is escaped so it isn't parsed as a markdown
	 * table column delimiter.
	 */
	private link(row: ProjectDashboardRow): string {
		if (!row.path) return row.slug;
		return `[[${row.path.replace(/\.md$/, '')}\\|${row.slug}]]`;
	}

	private mostCommonRole(activities: DashboardActivity[]): string {
		const counts = new Map<string, number>();
		for (const a of activities) {
			const role = a.role.trim();
			if (!role) continue;
			counts.set(role, (counts.get(role) ?? 0) + 1);
		}
		let best = '';
		let bestCount = 0;
		for (const [role, count] of counts.entries()) {
			if (count > bestCount) { best = role; bestCount = count; }
		}
		return best;
	}
}
