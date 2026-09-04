import { FileIO, AppLike } from '../utilities/FileIO';
import { NoteBlocksParser } from '../components/NoteBlocksParser';
import { ActivitiesInProgress } from '../components/ActivitiesInProgress';
import { TodoSyncManager } from '../components/TodoSyncManager';
import { AutoActivityCreator } from '../components/AutoActivityCreator';
import { ActivityComposer, ComposerSettings, PrebuiltBlocks } from './ActivityComposer';
import { dirOf, matchContextPagePath, parseContextPageFilename } from '../utilities/ContextPaths';
import { ROLES } from '../roles';

/**
 * Builds/refreshes a Contexts/YYYY-MM-DD-<Role>.md page: a dated, per-role
 * satellite of the daily note, living right next to it — wherever that
 * daily note actually is (its own Contexts subfolder, at whatever nesting
 * depth). It holds only that role's active Activities (## Activities,
 * safely bounded-replaced on every open — see ProjectDescriptionInjector
 * for the same pattern and why it must never match on generic "## "
 * headings) plus a freeform "## Notes" area the user can write into, which
 * is never touched.
 *
 * The filename bakes the role in alongside the date (not a bare YYYY-MM-DD,
 * which calendar-style plugins scan for as "today's daily note" from
 * anywhere in the vault) — see ContextPaths.ts. NoteBlocksParser still
 * assigns it the 'YYYY-MM-DD' tag (extracted from the filename, not the
 * whole basename), so new todos typed here under an existing
 * "##### [[Activities/X.md|X]]" heading sync into X's own Journal exactly
 * like they do from the daily note.
 */
export class ContextPageComposer {
	private fileIO = new FileIO();
	private parser = new NoteBlocksParser();
	private activitiesIP: ActivitiesInProgress;
	private activityComposer: ActivityComposer;
	private todoSyncManager: TodoSyncManager;
	private autoCreator = new AutoActivityCreator();

	constructor(private settings: ComposerSettings) {
		this.activitiesIP = new ActivitiesInProgress(settings);
		this.activityComposer = new ActivityComposer(settings);
		this.todoSyncManager = new TodoSyncManager(
			(app, file, prebuilt) => this.activityComposer.processActivity(app as AppLike, file, prebuilt),
			settings
		);
	}

	async processContextPage(
		app: AppLike,
		file: { path: string },
		role: string
	): Promise<void> {
		const filename = file.path.split('/').pop()!;
		const parsed = parseContextPageFilename(filename, ROLES);
		if (!parsed) return;
		const { date } = parsed;

		const today = this.fileIO.todayDate();
		// Only regenerate today's own page — past context pages are a frozen
		// historical record, same principle as past daily notes.
		if (date !== today) return;

		// Read BEFORE anything is written, so the journal-blocks scan below
		// (which may re-read this very file from disk) sees the user's real
		// typed content, not a placeholder.
		let raw = await this.fileIO.loadFile(app, file.path);
		if (raw === null) return;

		// file.path = "<dailyNoteDir>/Contexts/<date>-<Role>.md"
		const contextsFolder = dirOf(file.path);
		const dailyNoteDir = dirOf(contextsFolder);
		const dailyNotePath = `${dailyNoteDir}/${date}.md`;

		if (raw.trim().length === 0) {
			raw = this.defaultTemplate(role, date, dailyNotePath);
		}

		// Auto-create any Activity a brand-new wikilink here points to, tagged
		// with THIS page's role — before todoSyncManager runs, so a todo typed
		// right under it in the same edit syncs in on this very pass instead
		// of needing a second open. Unlike the daily note's own scan (which
		// has no role to offer and leaves `role:` blank for the user to fill
		// in), a Context page IS a role — so the new Activity starts already
		// correctly bucketed.
		try {
			await this.autoCreator.createMissingFromContent(app, raw, today, 'inbox', role);
		} catch (e) {
			console.error('[2ndBrain] contextPage autoActivityCreator failed:', e);
		}

		// ── Parse journal-like sources ONCE ──────────────────────────────────
		// Includes real Journal/YYYY-MM-DD.md files AND every Contexts/YYYY-MM-DD-*.md
		// page (any role, any day it exists, at any nesting depth) — so a todo
		// typed today under an activity heading here, or in another role's
		// context page, or in the daily note, all sync into that activity's own
		// Journal before we regenerate this page's Activities section.
		const journalFilePages = this.collectJournalLikeFiles(app);
		const projectFilePages = app.vault.getFiles()
			.filter((f: { path: string }) =>
				f.path.startsWith(this.settings.projectsFolder + '/') &&
				f.path.endsWith('.md')
			)
			.map((f: { path: string; name: string }) => ({ file: f }));

		const [journalBlocks, projectBlocks] = await Promise.all([
			this.parser.run(app, journalFilePages, 'YYYY-MM-DD'),
			this.parser.run(app, projectFilePages, null),
		]);
		const prebuilt: PrebuiltBlocks = { journalBlocks, projectBlocks };

		// Sync any newly-typed todos (here or elsewhere) into their Activity
		// files' own Journal sections BEFORE we bounded-replace this page's
		// Activities block — otherwise a not-yet-synced todo typed directly
		// under a regenerated heading would be silently overwritten.
		try {
			await this.todoSyncManager.run(app, prebuilt);
		} catch (e) {
			console.error('[2ndBrain] contextPage todoSyncManager failed:', e);
		}

		let freshSection = '';
		try {
			freshSection = await this.activitiesIP.runForRole(app, role, raw);
		} catch (e) {
			console.error('[2ndBrain] contextPage activitiesInProgress failed:', e);
		}

		const updated = this.injectActivitiesSection(raw, freshSection);
		await this.fileIO.saveFile(app, file.path, updated);
	}

	// ── Private ──────────────────────────────────────────────────────────────

	private collectJournalLikeFiles(app: AppLike): Array<{ file: { path: string; name: string } }> {
		const seen = new Map<string, { path: string; name: string }>();
		for (const f of app.vault.getFiles()) {
			const isRealJournalFile = f.path.startsWith(this.settings.journalFolder + '/');
			const isContextPage = !!matchContextPagePath(f.path, this.settings.journalFolder, ROLES);
			if (isRealJournalFile || isContextPage) {
				seen.set(f.path, f);
			}
		}
		return [...seen.values()].map(f => ({ file: f }));
	}

	private defaultTemplate(role: string, date: string, dailyNotePath: string): string {
		return [
			`# ${role} — ${date}`,
			'',
			`[[${dailyNotePath}|← Daily Note]]`,
			'',
			'## Activities',
			'',
			'## Notes',
			'',
		].join('\n');
	}

	/**
	 * Bounded-replace of the "## Activities" section: only the note's own
	 * "## Notes" marker (or end of file) ends it — never a generic "## "
	 * match, since the generated section itself contains nested headings
	 * ("### Activities:") and activity names could too.
	 */
	private injectActivitiesSection(content: string, sectionContent: string): string {
		const lines = content.split('\n');
		const startIdx = lines.findIndex(l => /^## Activities\s*$/.test(l));

		if (startIdx === -1) {
			// No marker yet — prepend a fresh scaffold.
			return [
				'## Activities',
				'',
				...(sectionContent ? [sectionContent] : []),
				'',
				'## Notes',
				'',
				...lines,
			].join('\n');
		}

		let endIdx = lines.length;
		for (let i = startIdx + 1; i < lines.length; i++) {
			if (/^## Notes\s*$/.test(lines[i]!)) {
				endIdx = i;
				break;
			}
		}

		const newLines = [
			...lines.slice(0, startIdx + 1),
			'',
			...(sectionContent ? [sectionContent] : []),
			'',
			...lines.slice(endIdx),
		];
		return newLines.join('\n');
	}
}
