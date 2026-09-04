/**
 * Pure computation of the Eisenhower Matrix dashboard: buckets Activities
 * into the four urgency/importance quadrants by their `priority:`
 * frontmatter field. No Obsidian API dependency (D7) — takes plain data
 * in, returns markdown out.
 */

import { scheduleAllowsToday } from '../utilities/ReminderSchedule';

export interface MatrixActivity {
	path: string;
	displayName: string;
	project: string;
	role: string;
	stage: string;
	startDate: string;
	priority: string;
	/** Effective planning flag — true means it shows in today's daily note. */
	takeToWork: boolean;
	/** Optional YYYY-MM-DD plan date. Display/sorting only, never daily-note gating. */
	takeToWorkDate: string;
	/** Scheduling hints — these now gate matrix visibility, not the daily note. */
	remind: string;
	snoozeUntil: string;
}

export interface MatrixQuadrant {
	key: string;
	heading: string;
	activities: MatrixActivity[];
}

const QUADRANTS: Array<{ key: string; heading: string }> = [
	{ key: 'urgent-important', heading: '🔥 Urgent & important — do first' },
	{ key: 'not-urgent-important', heading: '📅 Important, not urgent — schedule' },
	{ key: 'urgent-not-important', heading: '📨 Urgent, not important — delegate' },
	{ key: 'not-urgent-not-important', heading: '🗑️ Not urgent, not important — eliminate' },
];

/** The four `priority:` values that place an activity in a real quadrant. */
export const PRIORITY_KEYS: readonly string[] = QUADRANTS.map(q => q.key);
const OTHER_KEY = 'other';
const OTHER_HEADING = '❔ Unprioritized / other';

/**
 * Within a quadrant: what is already taken to work comes first (that is the
 * user's own commitment for today), then whatever is planned for a specific
 * date, soonest first, then the previous role/startDate/name ordering.
 */
function compareActivities(a: MatrixActivity, b: MatrixActivity): number {
	if (a.takeToWork !== b.takeToWork) return a.takeToWork ? -1 : 1;

	const planA = a.takeToWorkDate || '\uffff';
	const planB = b.takeToWorkDate || '\uffff';
	if (planA !== planB) return planA < planB ? -1 : 1;

	const roleA = a.role || '\uffff';
	const roleB = b.role || '\uffff';
	if (roleA !== roleB) return roleA.localeCompare(roleB);

	const da = a.startDate || '\uffff';
	const db = b.startDate || '\uffff';
	if (da !== db) return da < db ? -1 : 1;

	return a.displayName.localeCompare(b.displayName);
}

export class EisenhowerMatrix {

	/**
	 * Only open (non-done) activities belong on a working matrix, and only
	 * those the `remind`/`snoozeUntil` schedule says are worth considering
	 * today. Those two fields used to gate the daily note; now `takeToWork`
	 * owns that and they gate matrix visibility instead.
	 *
	 * @param today YYYY-MM-DD used to evaluate the schedule fields.
	 */
	buildQuadrants(activities: MatrixActivity[], today?: string): MatrixQuadrant[] {
		const day = today ?? new Date().toISOString().slice(0, 10);
		const open = activities.filter(a =>
			a.stage !== 'done' && scheduleAllowsToday(a.remind, a.snoozeUntil, day)
		);

		const quadrants: MatrixQuadrant[] = QUADRANTS.map(q => ({ ...q, activities: [] as MatrixActivity[] }));
		const other: MatrixQuadrant = { key: OTHER_KEY, heading: OTHER_HEADING, activities: [] };

		const byKey = new Map(quadrants.map(q => [q.key, q]));
		for (const activity of open) {
			const bucket = byKey.get(activity.priority) ?? other;
			bucket.activities.push(activity);
		}

		for (const q of quadrants) {
			q.activities.sort(compareActivities);
		}
		other.activities.sort(compareActivities);

		return other.activities.length > 0 ? [...quadrants, other] : quadrants;
	}

	render(quadrants: MatrixQuadrant[], generatedAt: string): string {
		const lines: string[] = [];
		lines.push('---');
		lines.push('---');
		lines.push('# Eisenhower Matrix');
		lines.push(`_Generated: ${generatedAt}_`);
		lines.push('');

		const total = quadrants.reduce((n, q) => n + q.activities.length, 0);
		if (total === 0) {
			lines.push('_No open activities found._');
			return lines.join('\n') + '\n';
		}

		for (const quadrant of quadrants) {
			lines.push(`## ${quadrant.heading}`);
			lines.push('');
			if (quadrant.activities.length === 0) {
				lines.push('_Nothing here._');
				lines.push('');
				continue;
			}

			lines.push('| Activity | In work | Planned | Role | Project | Stage | Started |');
			lines.push('|---|---|---|---|---|---|---|');
			for (const a of quadrant.activities) {
				const linkPath = a.path.replace(/\.md$/, '');
				lines.push(
					`| [[${linkPath}\\|${a.displayName}]] | ${a.takeToWork ? '✅' : '—'} | ` +
					`${a.takeToWorkDate || '—'} | ${a.role || '—'} | ${a.project || '—'} | ` +
					`${a.stage || '—'} | ${a.startDate || '—'} |`
				);
			}
			lines.push('');
		}

		return lines.join('\n').replace(/\n+$/, '\n');
	}
}
