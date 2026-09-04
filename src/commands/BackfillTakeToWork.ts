import { AppLike, FileIO } from '../utilities/FileIO';
import { TAKE_TO_WORK_FIELD } from '../utilities/TakeToWork';

export interface BackfillSettings {
	activitiesFolder: string;
	archiveFolder: string;
}

export interface BackfillResult {
	scanned: number;
	stamped: number;
	skipped: number;
}

/**
 * One-shot migration that makes `takeToWork` mandatory across the vault.
 *
 * Every activity is stamped `false`, giving the user an empty slate to plan
 * from. Deriving the value from `stage` instead would have been "backward
 * compatible" in the narrow sense — it reproduces exactly what the daily note
 * showed before — but that is precisely the behaviour the field exists to
 * replace. Migrating a vault into 25 pre-made choices defeats the point: the
 * user must choose, from the matrix, what today is for.
 *
 * Idempotent: activities that already carry the field are left untouched, so
 * re-running never wipes real decisions.
 */
export async function backfillTakeToWork(
	app: AppLike,
	settings: BackfillSettings
): Promise<BackfillResult> {
	const fileIO = new FileIO();
	const files = app.vault.getFiles().filter(f =>
		f.path.startsWith(settings.activitiesFolder + '/') &&
		!f.path.startsWith(settings.archiveFolder + '/') &&
		f.path.endsWith('.md')
	);

	const result: BackfillResult = { scanned: 0, stamped: 0, skipped: 0 };

	for (const file of files) {
		const handle = app.vault.getAbstractFileByPath(file.path);
		if (!handle) continue;

		const content = await app.vault.read(handle);
		if (fileIO.exceedsSizeLimit(content)) {
			result.skipped++;
			continue;
		}
		result.scanned++;

		if (fileIO.parseFrontmatterBool(content, TAKE_TO_WORK_FIELD) !== null) continue;

		try {
			await fileIO.updateFrontmatterFields(app, file.path, { [TAKE_TO_WORK_FIELD]: 'false' });
			result.stamped++;
		} catch (e) {
			console.error(`[2ndBrain] Backfill failed for ${file.path}:`, e);
			result.skipped++;
		}
	}

	return result;
}
