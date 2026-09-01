/**
 * Pure computation backing the Home landing page. No Obsidian API (D7).
 *
 * Home deliberately computes *no* per-activity or per-project detail — the
 * matrix and projects dashboards already own that. It answers only two
 * questions, at a glance, on one small screen: how balanced am I across my
 * roles today, and is the system itself healthy.
 */

export interface HomeJournalFile {
	path: string;
	basename: string;
}

export interface HomeActivity {
	role: string;
	project: string;
	stage: string;
	takeToWork: boolean;
}

export interface HomeProject {
	role: string;
	/** Health as computed by ProjectsDashboard: stalled / no-next-action / … */
	health: string;
}

export interface RoleStat {
	role: string;
	/** Today's Context page path, or null if it hasn't been built yet. */
	contextPath: string | null;
	/** Open activities planned into today. */
	taken: number;
	/** Activities not yet done. */
	open: number;
	/** Projects under this role asking for a decision (stalled / no next action). */
	needsDecision: number;
	/**
	 * True when the role owns open work but none of it is planned for today.
	 * The one signal that actually says "you are neglecting this part of
	 * your life" — a role with no open work at all is fine, not neglected.
	 */
	untouched: boolean;
}

export interface HealthSignal {
	id: 'stalled' | 'no-next-action' | 'untriaged' | 'unroled';
	label: string;
	count: number;
	/** Where to go to resolve it. */
	target: 'projects' | 'inbox' | 'matrix';
}

export interface HomeSummary {
	today: string;
	dailyNotePath: string | null;
	/** Total open activities planned into today, across all roles. */
	takenToday: number;
	/** Total activities not yet done. */
	openTotal: number;
	roles: RoleStat[];
	/** Only the signals with a non-zero count, most pressing first. */
	signals: HealthSignal[];
	/** True when every signal is clear — worth saying out loud. */
	allClear: boolean;
	recentJournal: HomeJournalFile[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Health values that mean "this project is waiting on a decision from you". */
const DECISION_HEALTH = new Set(['stalled', 'no-next-action']);

export class HomeDashboard {
	buildSummary(
		today: string,
		dailyNotePath: string | null,
		roleContextPaths: Map<string, string | null>,
		activities: HomeActivity[],
		projects: HomeProject[],
		journalFiles: HomeJournalFile[],
		recentLimit = 4
	): HomeSummary {
		const open = activities.filter(a => a.stage !== 'done');
		// A lingering flag on a finished activity is not a plan for today.
		const taken = open.filter(a => a.takeToWork);

		const roles: RoleStat[] = [...roleContextPaths.entries()].map(([role, contextPath]) => {
			const roleOpen = open.filter(a => a.role === role).length;
			const roleTaken = taken.filter(a => a.role === role).length;
			const needsDecision = projects.filter(
				p => p.role === role && DECISION_HEALTH.has(p.health)
			).length;
			return {
				role,
				contextPath,
				taken: roleTaken,
				open: roleOpen,
				needsDecision,
				untouched: roleOpen > 0 && roleTaken === 0,
			};
		});

		const signals = this.buildSignals(open, projects);

		return {
			today,
			dailyNotePath,
			takenToday: taken.length,
			openTotal: open.length,
			roles,
			signals,
			allClear: signals.length === 0,
			recentJournal: journalFiles
				.filter(f => DATE_RE.test(f.basename) && f.basename < today)
				.sort((a, b) => b.basename.localeCompare(a.basename))
				.slice(0, recentLimit),
		};
	}

	/**
	 * Ordered most-pressing first — stalled work is the most expensive thing
	 * to leave alone, an unroled activity the cheapest.
	 */
	private buildSignals(open: HomeActivity[], projects: HomeProject[]): HealthSignal[] {
		const countHealth = (h: string) => projects.filter(p => p.health === h).length;

		const untriaged = open.filter(a => {
			const project = a.project.trim().toLowerCase();
			return project === '' || project === 'inbox';
		}).length;
		const unroled = open.filter(a => a.role.trim() === '').length;

		const all: HealthSignal[] = [
			{ id: 'stalled', label: 'stalled', count: countHealth('stalled'), target: 'projects' },
			{
				id: 'no-next-action',
				label: 'no next action',
				count: countHealth('no-next-action'),
				target: 'projects',
			},
			{ id: 'untriaged', label: 'untriaged', count: untriaged, target: 'inbox' },
			{ id: 'unroled', label: 'no role', count: unroled, target: 'matrix' },
		];
		return all.filter(s => s.count > 0);
	}
}

/** Time-of-day greeting. `hour` is 0-23. */
export function greeting(hour: number): string {
	if (hour < 5) return 'Still awake';
	if (hour < 12) return 'Good morning';
	if (hour < 18) return 'Good afternoon';
	return 'Good evening';
}

/** "Tuesday, 1 September" — a human date, since the ISO one is already in the link. */
export function longDate(iso: string): string {
	const date = new Date(iso + 'T00:00:00Z');
	if (Number.isNaN(date.getTime())) return iso;
	const day = date.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
	const rest = date.toLocaleDateString('en-GB', {
		day: 'numeric', month: 'long', timeZone: 'UTC',
	});
	return `${day}, ${rest}`;
}
