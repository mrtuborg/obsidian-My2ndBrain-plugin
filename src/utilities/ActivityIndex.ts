import { AppLike, FileIO } from './FileIO';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ActivityRecord {
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
	/** Raw `priority:` frontmatter value, trimmed. '' if unset. */
	priority: string;
}

/**
 * Scans every non-archived Activity file and parses the handful of
 * frontmatter fields the various dashboards/rollups need. Shared by
 * ProjectsDashboardComposer, InboxActivitiesComposer, and
 * EisenhowerMatrixComposer so the scanning/parsing rules (size limits,
 * archive exclusion, date validation) stay in exactly one place.
 */
export async function loadActivityRecords(
	app: AppLike,
	activitiesFolder: string,
	archiveFolder: string
): Promise<ActivityRecord[]> {
	const fileIO = new FileIO();
	const files = app.vault.getFiles().filter(f =>
		f.path.startsWith(activitiesFolder + '/') &&
		!f.path.startsWith(archiveFolder + '/') &&
		f.path.endsWith('.md')
	);

	const result: ActivityRecord[] = [];
	for (const file of files) {
		const handle = app.vault.getAbstractFileByPath(file.path);
		if (!handle) continue;
		const content = await app.vault.read(handle);
		if (fileIO.exceedsSizeLimit(content)) continue;

		const startDateRaw = fileIO.parseFrontmatterField(content, 'startDate') ?? '';
		result.push({
			path: file.path,
			displayName: file.basename,
			project: (fileIO.parseFrontmatterField(content, 'project') ?? '').trim(),
			role: (fileIO.parseFrontmatterField(content, 'role') ?? '').trim(),
			stage: (fileIO.parseFrontmatterField(content, 'stage') ?? '').trim(),
			startDate: DATE_RE.test(startDateRaw) ? startDateRaw : '',
			priority: (fileIO.parseFrontmatterField(content, 'priority') ?? '').trim(),
		});
	}
	return result;
}
