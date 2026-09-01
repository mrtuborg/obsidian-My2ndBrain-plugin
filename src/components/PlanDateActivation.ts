import { AppLike, FileIO } from '../utilities/FileIO';
import { loadActivityRecords } from '../utilities/ActivityIndex';
import {
	TAKE_TO_WORK_FIELD,
	TAKE_TO_WORK_DATE_FIELD,
	planDateHasArrived,
} from '../utilities/TakeToWork';

export interface PlanDateSettings {
	activitiesFolder: string;
	archiveFolder: string;
}

/**
 * Fires the `takeToWorkDate` alarm.
 *
 * Planning an activity for a future date should mean something: on that day
 * it must show up in the daily note without the user having to remember to
 * press anything. This runs before the daily note's Activities section is
 * built, so an activity planned for today is already flagged by the time the
 * section is rendered.
 *
 * The date is always consumed, never left behind. A date that stayed in the
 * frontmatter would re-take the activity every single render, making it
 * impossible to drop for as long as the date remained in the past.
 *
 * A finished activity is not resurrected — its stale date is simply cleared.
 */
export class PlanDateActivation {
	private fileIO = new FileIO();

	constructor(private settings: PlanDateSettings) {}

	/** Returns the paths of the activities that were newly taken to work. */
	async run(app: AppLike, today: string): Promise<string[]> {
		const records = await loadActivityRecords(
			app, this.settings.activitiesFolder, this.settings.archiveFolder
		);

		const activated: string[] = [];
		for (const record of records) {
			if (!planDateHasArrived(record.takeToWorkDate, today)) continue;

			const isDone = record.stage === 'done';
			const fields: Record<string, string | null> = {
				[TAKE_TO_WORK_DATE_FIELD]: null,
			};
			if (!isDone) fields[TAKE_TO_WORK_FIELD] = 'true';

			try {
				await this.fileIO.updateFrontmatterFields(app, record.path, fields);
				if (!isDone) activated.push(record.path);
			} catch (e) {
				console.error(`[2ndBrain] Could not activate plan date on ${record.path}:`, e);
			}
		}
		return activated;
	}
}
