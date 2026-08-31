import { AppLike, FileIO } from '../utilities/FileIO';
import { TAKE_TO_WORK_FIELD, deriveTakeToWork } from '../utilities/TakeToWork';

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
 * Activities written before the field existed get it stamped from their stage
 * (`doing` → true, anything else → false), which is exactly the fallback the
 * read paths already apply — so the vault's behaviour does not change, it just
 * becomes explicit and clickable from the matrix.
 *
 * Idempotent: activities that already carry the field are left untouched.
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

		const stage = fileIO.parseFrontmatterField(content, 'stage');
		const value = deriveTakeToWork(stage) ? 'true' : 'false';

		try {
			await fileIO.updateFrontmatterFields(app, file.path, { [TAKE_TO_WORK_FIELD]: value });
			result.stamped++;
		} catch (e) {
			console.error(`[2ndBrain] Backfill failed for ${file.path}:`, e);
			result.skipped++;
		}
	}

	return result;
}
