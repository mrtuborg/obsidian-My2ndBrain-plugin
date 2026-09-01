/**
 * Pure computation backing the Home landing page: which roles have today's
 * Context page ready, how much untriaged work is sitting in the Inbox, and
 * the most recent Journal entries to glance back at. No Obsidian API (D7).
 */

export interface HomeJournalFile {
	path: string;
	/** File basename, expected to be a YYYY-MM-DD date for real daily notes. */
	basename: string;
}

export interface RoleContextStatus {
	role: string;
	/** Path of today's Context page for this role, or null if not built yet. */
	path: string | null;
}

export interface HomeSummary {
	today: string;
	/** Today's daily note path, or null if it hasn't been created yet. */
	dailyNotePath: string | null;
	roles: RoleContextStatus[];
	/** Untriaged: project-less (or `project: inbox`) and not yet done. */
	inboxCount: number;
	/** Most recent Journal daily notes, newest first, excluding today. */
	recentJournal: HomeJournalFile[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class HomeDashboard {
	/**
	 * @param recentLimit How many past daily notes to surface. Small on
	 * purpose — this is a glance-back, not a browsing list.
	 */
	buildSummary(
		today: string,
		dailyNotePath: string | null,
		roleContextPaths: Map<string, string | null>,
		activities: Array<{ project: string; stage: string }>,
		journalFiles: HomeJournalFile[],
		recentLimit = 5
	): HomeSummary {
		const roles: RoleContextStatus[] = [...roleContextPaths.entries()]
			.map(([role, path]) => ({ role, path }));

		const inboxCount = activities.filter(a => {
			if (a.stage === 'done') return false;
			const project = a.project.trim().toLowerCase();
			return project === '' || project === 'inbox';
		}).length;

		const recentJournal = journalFiles
			.filter(f => DATE_RE.test(f.basename) && f.basename < today)
			.sort((a, b) => b.basename.localeCompare(a.basename))
			.slice(0, recentLimit);

		return { today, dailyNotePath, roles, inboxCount, recentJournal };
	}
}
