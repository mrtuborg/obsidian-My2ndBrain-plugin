import { FileIO, AppLike } from '../utilities/FileIO';
import { BlockCollection } from './BlockCollection';

const ACTIVITIES_FOLDER = 'Activities';
const ARCHIVE_FOLDER = 'Activities/Archive';

export interface TodoSyncSettings {
	activitiesFolder: string;
	archiveFolder: string;
}

export interface PrebuiltBlocks {
	journalBlocks: BlockCollection;
	projectBlocks: BlockCollection;
}

type ProcessActivityFn = (
	app: AppLike,
	file: { path: string },
	prebuilt?: PrebuiltBlocks
) => Promise<void>;

export class TodoSyncManager {
	private fileIO = new FileIO();
	private processActivity: ProcessActivityFn;
	private activitiesFolder: string;
	private archiveFolder: string;

	constructor(processActivity: ProcessActivityFn, settings?: TodoSyncSettings) {
		this.processActivity = processActivity;
		this.activitiesFolder = settings?.activitiesFolder ?? ACTIVITIES_FOLDER;
		this.archiveFolder = settings?.archiveFolder ?? ARCHIVE_FOLDER;
	}

	/** @param prebuilt - pre-parsed journal+project blocks; eliminates per-activity re-parsing */
	async run(app: AppLike, prebuilt?: PrebuiltBlocks): Promise<void> {
		const files = app.vault.getFiles().filter(f =>
			f.path.startsWith(this.activitiesFolder + '/') &&
			!f.path.startsWith(this.archiveFolder + '/') &&
			!f.path.startsWith(this.activitiesFolder + '/Workflow/') &&
			f.path.endsWith('.md')
		);

		for (const file of files) {
			const fileHandle = app.vault.getAbstractFileByPath(file.path);
			if (!fileHandle) continue;

			const content = await app.vault.read(fileHandle);
			const stage = this.fileIO.parseFrontmatterField(content, 'stage');
			if (stage !== 'active') continue;
			const startDate = this.fileIO.parseFrontmatterField(content, 'startDate');
			if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) continue;

			await this.processActivity(app, fileHandle, prebuilt);
		}
	}
}
