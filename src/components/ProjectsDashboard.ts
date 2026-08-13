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
	percentDone: number;
	oldestOpenDate: string;
	latestDate: string;
}

export class ProjectsDashboard {

	buildRows(activities: DashboardActivity[], projects: DashboardProject[]): ProjectDashboardRow[] {
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

			rows.push({
				slug,
				path: project?.path ?? null,
				role,
				total,
				done,
				doing,
				backlog,
				percentDone,
				oldestOpenDate,
				latestDate,
			});
		}

		rows.sort((a, b) => {
			const roleA = a.role || '\uffff';
			const roleB = b.role || '\uffff';
			if (roleA !== roleB) return roleA.localeCompare(roleB);

			if (a.percentDone !== b.percentDone) return a.percentDone - b.percentDone;
			return a.slug.localeCompare(b.slug);
		});

		return rows;
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

		let currentRole: string | null = null;
		for (const row of rows) {
			const roleHeading = row.role || '(no role)';
			if (roleHeading !== currentRole) {
				currentRole = roleHeading;
				lines.push(`## ${roleHeading}`);
				lines.push('');
				lines.push('| Project | Progress | Doing | Backlog | Oldest open | Last activity |');
				lines.push('|---|---|---|---|---|---|');
			}

			// Escape the pipe inside the wikilink alias so it doesn't get parsed
			// as a markdown table column delimiter.
			const linkPath = row.path ? row.path.replace(/\.md$/, '') : null;
			const name = linkPath ? `[[${linkPath}\\|${row.slug}]]` : row.slug;
			const progress = `${row.done}/${row.total} (${row.percentDone}%)`;

			lines.push(`| ${name} | ${progress} | ${row.doing} | ${row.backlog} | ${row.oldestOpenDate || '—'} | ${row.latestDate || '—'} |`);
		}

		return lines.join('\n') + '\n';
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
