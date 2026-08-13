import { AppLike, FileIO } from '../utilities/FileIO';
import { loadActivityRecords } from '../utilities/ActivityIndex';
import { EisenhowerMatrix, MatrixActivity } from '../components/EisenhowerMatrix';

export interface EisenhowerMatrixSettings {
	activitiesFolder: string;
	archiveFolder: string;
}

/**
 * Obsidian-facing wrapper around EisenhowerMatrix: gathers every open
 * (non-done) Activity from the vault and writes the rendered quadrant
 * breakdown into the matrix note. Regenerated on every open, same pattern
 * as the Projects Dashboard and Context pages.
 */
export class EisenhowerMatrixComposer {
	private fileIO = new FileIO();
	private matrix = new EisenhowerMatrix();

	constructor(private settings: EisenhowerMatrixSettings) {}

	async refresh(app: AppLike, path: string): Promise<void> {
		const content = await this.generate(app);
		const file = app.vault.getAbstractFileByPath(path);
		if (!file) return;
		await app.vault.modify(file, content);
	}

	async generate(app: AppLike): Promise<string> {
		const activities: MatrixActivity[] = await loadActivityRecords(
			app, this.settings.activitiesFolder, this.settings.archiveFolder
		);
		const quadrants = this.matrix.buildQuadrants(activities);
		return this.matrix.render(quadrants, this.fileIO.todayDate());
	}
}
