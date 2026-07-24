import { FileIO, AppLike } from '../utilities/FileIO';
import { NoteBlocksParser } from '../components/NoteBlocksParser';
import { AttributesProcessor } from '../components/AttributesProcessor';
import { ProjectDescriptionInjector } from '../components/ProjectDescriptionInjector';
import { MentionsProcessor } from '../components/MentionsProcessor';
import { BlockCollection } from '../components/BlockCollection';

export interface ComposerSettings {
	journalFolder: string;
	projectsFolder: string;
	activitiesFolder: string;
	archiveFolder: string;
	syncGraceSeconds?: number;
}

const STANDARD_FIELDS = new Set(['startDate', 'stage', 'responsible', 'type', 'project']);

export interface PrebuiltBlocks {
	journalBlocks: BlockCollection;
	projectBlocks: BlockCollection;
}

export class ActivityComposer {
	private fileIO = new FileIO();
	private parser = new NoteBlocksParser();
	private attrProcessor = new AttributesProcessor();
	private descInjector = new ProjectDescriptionInjector();
	private mentionsProc = new MentionsProcessor();

	constructor(private settings: ComposerSettings) {}

	async processActivity(
		app: AppLike,
		file: { path: string },
		prebuilt?: PrebuiltBlocks
	): Promise<void> {
		// 1. Load raw content
		const rawContent = await this.fileIO.loadFile(app, file.path);
		if (rawContent === null) return;

		// Bail out before the expensive vault-wide journal/project parse below —
		// an oversized activity (accumulated pasted content, no archiving) makes
		// that full reparse+rewrite costly enough to crash Obsidian's renderer.
		if (this.fileIO.exceedsSizeLimit(rawContent)) {
			throw new Error(
				`Activity ${file.path} is too large to auto-process (` +
				`${(this.fileIO.byteLength(rawContent) / 1024).toFixed(0)}KB). ` +
				`Split it into smaller activities or archive old content manually.`
			);
		}

		// 2. Parse Standard fields from raw text (never from metadataCache — invariant A.3.1)
		const startDateRaw = this.fileIO.parseFrontmatterField(rawContent, 'startDate');
		// Validation: startDate must exist and be YYYY-MM-DD format.
		// Never fall back to today — that overwrites history and breaks migration tracking.
		// If Templater placeholder found, throw error so user fixes it manually.
		if (!startDateRaw) {
			throw new Error(`Activity ${rawContent.split('\n')[0]}: startDate is required in frontmatter`);
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateRaw)) {
			throw new Error(`Activity ${rawContent.split('\n')[0]}: startDate must be YYYY-MM-DD format (found: "${startDateRaw}")`);
		}
		const startDate = startDateRaw;
		const stage     = this.fileIO.parseFrontmatterField(rawContent, 'stage') ?? 'doing';
		const respRaw   = this.fileIO.parseFrontmatterField(rawContent, 'responsible') ?? '[Me]';
		// responsible is stored as YAML inline sequence: "[Me]" → parse to ['Me']
		const responsible: string[] = respRaw.startsWith('[') && respRaw.endsWith(']')
			? respRaw.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
			: [respRaw];
		const type      = this.fileIO.parseFrontmatterField(rawContent, 'type') ?? null;

		// Extra fields must be preserved unchanged (invariant A.1.6)
		const extraFields = this.fileIO.parseExtraFrontmatterFields(rawContent, STANDARD_FIELDS);

		// 3. Build frontmatter object for directive mutations
		const frontmatterObj: Record<string, unknown> = { startDate, stage, responsible, type };

		// 4. Extract content sections
		const { dataviewJsBlock, pageContent } = this.fileIO.extractFrontmatterAndDataviewJs(rawContent);

		// 5. Parse attribute directives (mutates frontmatterObj)
		let body = this.attrProcessor.processAttributes(frontmatterObj, pageContent);

		// 6. Use pre-built journal blocks if provided (major performance win when called
		//    from todoSyncManager — avoids re-parsing all journal files per activity).
		const journalBlocks = prebuilt?.journalBlocks ?? await this.parser.run(
			app,
			app.vault.getFiles()
				.filter((f: { path: string }) =>
					f.path.startsWith(this.settings.journalFolder + '/') &&
					f.path !== file.path
				)
				.map((f: { path: string; name: string }) => ({ file: f })),
			'YYYY-MM-DD'
		);

		// 7. Use pre-built project blocks if provided.
		const projectBlocks = prebuilt?.projectBlocks ?? await this.parser.run(
			app,
			app.vault.getFiles()
				.filter((f: { path: string }) =>
					f.path.startsWith(this.settings.projectsFolder + '/') &&
					f.path.endsWith('.md')
				)
				.map((f: { path: string; name: string }) => ({ file: f })),
			null
		);

		// 8. Inject ## Description from Projects/ (replace-semantics)
		body = await this.descInjector.run(body, projectBlocks, this.tagId(file.path));

		// 9. Update ## Journal from Journal/ (append-semantics + checkbox sync)
		const mentions = await this.mentionsProc.run(body, journalBlocks, this.tagId(file.path), frontmatterObj);
		if (mentions && mentions.trim().length > 0) body = mentions;

		// 10. Rebuild frontmatter (with mutated Standard fields + preserved Extra fields)
		const updatedStage     = (frontmatterObj['stage'] as string) ?? stage;
		const updatedStartDate = (frontmatterObj['startDate'] as string) ?? startDate;
		const newFrontmatter = this.fileIO.generateActivityHeader(
			updatedStartDate, updatedStage, responsible, type, extraFields
		);

		// 11. Compose and save
		const combined = [newFrontmatter, dataviewJsBlock, body]
			.filter(s => s && s.trim())
			.join('\n\n');

		await this.fileIO.saveFile(app, file.path, combined);
	}

	private tagId(filePath: string): string {
		return filePath.split('/').pop()!.replace(/\.md$/, '');
	}
}
