import { AppLike, FileIO } from '../utilities/FileIO';
import { loadActivityRecords } from '../utilities/ActivityIndex';
import { EisenhowerMatrix, MatrixActivity } from '../components/EisenhowerMatrix';

export interface EisenhowerMatrixSettings {
	activitiesFolder: string;
	archiveFolder: string;
}

/** Fence the plugin's markdown code block processor renders the live matrix into. */
export const MATRIX_CODE_BLOCK_LANG = '2ndbrain-matrix';

const MATRIX_STUB = [
	'---',
	'---',
	'# Eisenhower Matrix',
	'',
	'```' + MATRIX_CODE_BLOCK_LANG,
	'```',
	'',
].join('\n');

/**
 * Obsidian-facing wrapper around EisenhowerMatrix.
 *
 * The matrix is no longer written out as static markdown tables: it is a live
 * view rendered from a `2ndbrain-matrix` code block, so it can carry the
 * take-to-work / plan / done buttons. This composer therefore only has to make
 * sure the note contains that block — it deliberately does *not* rewrite the
 * note on every open any more, which also removes a constant source of sync
 * churn on a file the user never edits by hand.
 */
export class EisenhowerMatrixComposer {
	private fileIO = new FileIO();
	private matrix = new EisenhowerMatrix();

	constructor(private settings: EisenhowerMatrixSettings) {}

	async refresh(app: AppLike, path: string): Promise<void> {
		const file = app.vault.getAbstractFileByPath(path);
		if (!file) return;

		const content = await app.vault.read(file);
		if (content.includes('```' + MATRIX_CODE_BLOCK_LANG)) return;

		await app.vault.modify(file, MATRIX_STUB);
	}

	/** The note skeleton: frontmatter, title, and the live-view code block. */
	stub(): string {
		return MATRIX_STUB;
	}

	/**
	 * Static markdown rendering of the matrix. No longer used for the note
	 * itself, but kept as the pure, testable description of the same data —
	 * and as an export path for anywhere a live view can't run.
	 */
	async generate(app: AppLike): Promise<string> {
		const activities: MatrixActivity[] = await loadActivityRecords(
			app, this.settings.activitiesFolder, this.settings.archiveFolder
		);
		const today = this.fileIO.todayDate();
		const quadrants = this.matrix.buildQuadrants(activities, today);
		return this.matrix.render(quadrants, today);
	}
}
