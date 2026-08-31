import { AppLike, FileIO } from './FileIO';
import {
	TAKE_TO_WORK_FIELD,
	TAKE_TO_WORK_DATE_FIELD,
	resolveTakeToWork,
	normalizeTakeToWorkDate,
} from './TakeToWork';

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
	/** Effective `takeToWork:` flag — explicit when set, else derived from stage. */
	takeToWork: boolean;
	/** `takeToWorkDate:` if a valid YYYY-MM-DD, else ''. Matrix display only. */
	takeToWorkDate: string;
	/** Raw `remind:` frontmatter value, trimmed. '' if unset. */
	remind: string;
	/** Raw `snoozeUntil:` frontmatter value, trimmed. '' if unset. */
	snoozeUntil: string;
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
		const stage = (fileIO.parseFrontmatterField(content, 'stage') ?? '').trim();
		result.push({
			path: file.path,
			displayName: file.basename,
			project: (fileIO.parseFrontmatterField(content, 'project') ?? '').trim(),
			role: (fileIO.parseFrontmatterField(content, 'role') ?? '').trim(),
			stage,
			startDate: DATE_RE.test(startDateRaw) ? startDateRaw : '',
			priority: (fileIO.parseFrontmatterField(content, 'priority') ?? '').trim(),
			takeToWork: resolveTakeToWork(
				fileIO.parseFrontmatterBool(content, TAKE_TO_WORK_FIELD), stage
			),
			takeToWorkDate: normalizeTakeToWorkDate(
				fileIO.parseFrontmatterField(content, TAKE_TO_WORK_DATE_FIELD)
			),
			remind: (fileIO.parseFrontmatterField(content, 'remind') ?? '').trim(),
			snoozeUntil: (fileIO.parseFrontmatterField(content, 'snoozeUntil') ?? '').trim(),
		});
	}
	return result;
}
