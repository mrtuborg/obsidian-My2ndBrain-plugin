/**
 * Pure computation of the Eisenhower Matrix dashboard: buckets Activities
 * into the four urgency/importance quadrants by their `priority:`
 * frontmatter field. No Obsidian API dependency (D7) — takes plain data
 * in, returns markdown out.
 */

export interface MatrixActivity {
	path: string;
	displayName: string;
	project: string;
	role: string;
	stage: string;
	startDate: string;
	priority: string;
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
const OTHER_KEY = 'other';
const OTHER_HEADING = '❔ Unprioritized / other';

export class EisenhowerMatrix {

	/** Only open (non-done) activities belong on a working matrix. */
	buildQuadrants(activities: MatrixActivity[]): MatrixQuadrant[] {
		const open = activities.filter(a => a.stage !== 'done');

		const quadrants: MatrixQuadrant[] = QUADRANTS.map(q => ({ ...q, activities: [] as MatrixActivity[] }));
		const other: MatrixQuadrant = { key: OTHER_KEY, heading: OTHER_HEADING, activities: [] };

		const byKey = new Map(quadrants.map(q => [q.key, q]));
		for (const activity of open) {
			const bucket = byKey.get(activity.priority) ?? other;
			bucket.activities.push(activity);
		}

		for (const q of quadrants) {
			q.activities.sort((a, b) => {
				const roleA = a.role || '\uffff';
				const roleB = b.role || '\uffff';
				if (roleA !== roleB) return roleA.localeCompare(roleB);
				const da = a.startDate || '\uffff';
				const db = b.startDate || '\uffff';
				if (da !== db) return da < db ? -1 : 1;
				return a.displayName.localeCompare(b.displayName);
			});
		}

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

			lines.push('| Activity | Role | Project | Stage | Started |');
			lines.push('|---|---|---|---|---|');
			for (const a of quadrant.activities) {
				const linkPath = a.path.replace(/\.md$/, '');
				lines.push(`| [[${linkPath}\\|${a.displayName}]] | ${a.role || '—'} | ${a.project || '—'} | ${a.stage || '—'} | ${a.startDate || '—'} |`);
			}
			lines.push('');
		}

		return lines.join('\n').replace(/\n+$/, '\n');
	}
}
