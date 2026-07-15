import { FileIO, AppLike } from '../utilities/FileIO';
import { NoteBlocksParser } from '../components/NoteBlocksParser';
import { MentionsProcessor } from '../components/MentionsProcessor';
import { ActivitiesInProgress } from '../components/ActivitiesInProgress';
import { AutoActivityCreator } from '../components/AutoActivityCreator';
import { ScriptsRemove } from '../utilities/ScriptsRemove';
import { TodoSyncManager } from '../components/TodoSyncManager';
import { ActivityComposer, ComposerSettings, PrebuiltBlocks } from './ActivityComposer';

export class DailyNoteComposer {
	private fileIO = new FileIO();
	private parser = new NoteBlocksParser();
	private mentionsProc = new MentionsProcessor();
	private activitiesIP = new ActivitiesInProgress();
	private autoCreator = new AutoActivityCreator();
	private scriptsRemove = new ScriptsRemove();
	private activityComposer: ActivityComposer;
	private todoSyncManager: TodoSyncManager;

	constructor(private settings: ComposerSettings) {
		this.activityComposer = new ActivityComposer(settings);
		this.activitiesIP = new ActivitiesInProgress(settings);
		this.todoSyncManager = new TodoSyncManager(
			(app, file, prebuilt) => this.activityComposer.processActivity(app as AppLike, file, prebuilt),
			settings
		);
	}

	async processDailyNote(
		app: AppLike,
		file: { path: string; basename: string }
	): Promise<void> {
		const today = this.fileIO.todayDate();
		const pageIsToday = file.basename === today;

		// Load current content
		const rawContent = await this.fileIO.loadFile(app, file.path);
		if (rawContent === null) return;

		const header = this.fileIO.generateDailyNoteHeader(file.basename);
		const existing = rawContent.trim();

		// If today's note was already fully processed (has Activities section),
		// treat it as a static frozen record — do not reprocess.
		// The user can delete the Activities section to force a refresh.
		if (pageIsToday && existing.includes('### Activities:')) {
			return;
		}

		// Write header + "building" placeholder immediately so the note is never blank.
		// For today's note, also show a progress indicator while the pipeline runs.
		// For a fresh past note (deleted and recreated), show a recovery indicator.
		// A "fresh past note" is one that was just created (deleted and recreated).
		// Distinguish from old notes with DataviewJS template content by checking
		// that the file has minimal content (< 20 chars = just a newline or truly empty).
		const isFreshPastNote = !pageIsToday && existing.length < 20;
		if (!existing || !existing.startsWith('---')) {
			const placeholder = pageIsToday
				? header + '\n\n> ⏳ Building Activities section…'
				: isFreshPastNote
					? header + '\n\n> ⏳ Recovering from activity history…'
					: header;
			await this.fileIO.saveFile(app, file.path, placeholder);
		}

		// Strip raw Templater preamble <%* ... %> if Templater didn't fire
		let cleanedContent = rawContent;
		if (cleanedContent.includes('<%')) {
			cleanedContent = cleanedContent.replace(/<%\*[\s\S]*?%>\s*/g, '').trim();
		}

		// Strip header from content so it's re-added cleanly at the end
		let pageContent = cleanedContent.replace(header, '').trim();
		const { dataviewJsBlock, pageContent: bodyContent } = this.fileIO.extractFrontmatterAndDataviewJs(pageContent);
		pageContent = bodyContent;

		// ── Parse journal + project files ONCE ───────────────────────────────
		// These BlockCollections are shared across todoSyncManager (per-activity processing)
		// and the daily note's own mentionsProcessor — eliminating O(n_activities) re-parsing.
		const journalFilePages = app.vault.getFiles()
			.filter((f: { path: string }) =>
				f.path.startsWith(this.settings.journalFolder + '/') &&
				f.path !== file.path
			)
			.map((f: { path: string; name: string }) => ({ file: f }));

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

		// ── Today-only steps ─────────────────────────────────────────────────
		if (pageIsToday) {
			// B.2.3: auto-create missing Activity files
			try { await this.runAutoCreator(app, today); } catch (e) {
				console.error('[2ndBrain] autoActivityCreator failed:', e);
			}

			// B.2.4: sync activity todos — passes pre-built blocks so each activity
			// does NOT re-parse journals (25× speedup for 25 active activities)
			try { await this.todoSyncManager.run(app as any, prebuilt); } catch (e) {
				console.error('[2ndBrain] todoSyncManager failed:', e);
			}

			// B.2.5: build Activities section
			try {
				const activities = await this.activitiesIP.run(app as any, pageContent);
				if (activities && activities.trim().length > 0) {
					pageContent = activities + '\n' + (pageContent || '');
				}
			} catch (e) {
				console.error('[2ndBrain] activitiesInProgress failed:', e);
			}
		} else if (isFreshPastNote) {
			// ── Past note recovery ────────────────────────────────────────────
			// The note was deleted and recreated. Reconstruct what happened on
			// that day by scanning all activity files for [[targetDate]] journal sections.
			try {
				const recovered = await this.reconstructPastActivities(app, file.basename);
				if (recovered && recovered.trim().length > 0) {
					pageContent = recovered + '\n' + (pageContent || '');
				}
			} catch (e) {
				console.error('[2ndBrain] past note recovery failed:', e);
			}
		}

		// B.2.6: cross-references from other journal entries (reuse pre-built blocks)
		const mentions = await this.mentionsProc.run(pageContent, journalBlocks, file.basename);
		if (mentions && mentions.trim().length > 0) pageContent = mentions;

		// B.2.7: remove script block (today only — freeze to static)
		let script = dataviewJsBlock;
		if (pageIsToday) {
			script = await this.scriptsRemove.run(script);
		}

		// B.2.8: save final content (replaces the placeholder)
		const parts = [header];
		if (script && script.trim()) parts.push(script);
		if (pageContent && pageContent.trim()) parts.push(pageContent);

		const combined = parts.join('\n');
		await this.fileIO.saveFile(app, file.path, combined);
	}

	// ── Private ──────────────────────────────────────────────────────────────

	/**
	 * Reconstruct what a past daily note should show by scanning ALL activity
	 * files (active and archived) for journal entries recorded on `targetDate`.
	 *
	 * Strategy 1 (precise): Find state-change entries for that date in Journal sections.
	 * Strategy 2 (fallback): If nothing found, show all activities that had
	 *   startDate ≤ targetDate with their current open todos — approximates the
	 *   "what was active on that day" view. Useful after Journal compaction removed
	 *   carry-forward entries.
	 *
	 * This is the inverse of mentionsProcessor: instead of "what journals mention
	 * this activity?", it answers "what activities were touched on this date?".
	 */
	private async reconstructPastActivities(
		app: AppLike,
		targetDate: string
	): Promise<string> {
		const datePattern = `[[${targetDate}]]`;

		// Scan ALL activity files including Archive (historical data)
		const activityFiles = app.vault.getFiles().filter((f: { path: string }) =>
			f.path.startsWith(this.settings.activitiesFolder + '/') &&
			!f.path.startsWith(this.settings.activitiesFolder + '/Workflow/') &&
			f.path.endsWith('.md')
		);

		// ── Strategy 1: precise — find state-change entries for targetDate ────
		const preciseBlocks: string[] = ['----', '', '### Activities:', '----'];
		let preciseFound = false;

		for (const file of activityFiles) {
			const handle = app.vault.getAbstractFileByPath(file.path);
			if (!handle) continue;
			const content = await app.vault.read(handle);
			if (!content.includes(datePattern)) continue;

			const journalLines = this.extractJournalLines(content);
			const dateLines = this.extractSectionForDate(journalLines, targetDate);
			if (!dateLines.length) continue;

			const displayName = file.path.split('/').pop()!.replace(/\.md$/, '');
			preciseBlocks.push(`##### [[${file.path}|${displayName}]]`);
			preciseBlocks.push(...dateLines);
			preciseBlocks.push('----');
			preciseFound = true;
		}

		if (preciseFound) return preciseBlocks.join('\n');

		// ── Strategy 2: fallback — show activities active as of targetDate ────
		// Useful when Journal compaction removed carry-forward entries.
		// Uses startDate ≤ targetDate as the "was active then" criterion.
		const fallbackBlocks: string[] = ['----', '', '### Activities:', '----'];
		let fallbackFound = false;

		for (const file of activityFiles) {
			// Skip Archive in fallback — only current activities
			if (file.path.startsWith(this.settings.archiveFolder + '/')) continue;

			const handle = app.vault.getAbstractFileByPath(file.path);
			if (!handle) continue;
			const content = await app.vault.read(handle);

			const startDate = this.fileIO.parseFrontmatterField(content, 'startDate');
			if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) continue;
			if (startDate > targetDate) continue;  // Started after the target date

			const openTodos = this.extractOpenTodosFromJournal(content);

			const displayName = file.path.split('/').pop()!.replace(/\.md$/, '');
			fallbackBlocks.push(`##### [[${file.path}|${displayName}]]`);
			fallbackBlocks.push(...openTodos);
			fallbackBlocks.push('----');
			fallbackFound = true;
		}

		if (!fallbackFound) return '';
		return fallbackBlocks.join('\n');
	}

	/** Extract open (non-completed) todos from the ## Journal section. */
	private extractOpenTodosFromJournal(content: string): string[] {
		const lines = this.extractJournalLines(content);
		const openLines = lines.filter(l => /^\s*- \[ \] /.test(l)).map(l => l.trim());
		const doneTexts = new Set(
			lines.filter(l => /^\s*- \[x\] /.test(l)).map(l => l.trim().slice('- [x] '.length))
		);
		const seen = new Set<string>();
		return openLines.filter(l => {
			const text = l.slice('- [ ] '.length);
			if (doneTexts.has(text) || seen.has(text)) return false;
			seen.add(text);
			return true;
		});
	}

	/** Extract all lines inside the ## Journal section of an activity file. */
	private extractJournalLines(content: string): string[] {
		const lines = content.split('\n');
		let inJournal = false;
		const result: string[] = [];
		for (const line of lines) {
			if (/^## Journal\s*$/.test(line)) { inJournal = true; continue; }
			if (inJournal && /^## /.test(line)) break;
			if (inJournal) result.push(line);
		}
		return result;
	}

	/**
	 * Given the lines of a ## Journal section, extract the content lines
	 * that belong to the [[targetDate]] sub-section.
	 */
	private extractSectionForDate(journalLines: string[], targetDate: string): string[] {
		const marker = `[[${targetDate}]]`;
		let inSection = false;
		const result: string[] = [];

		for (const line of journalLines) {
			const trimmed = line.trim();

			if (trimmed === marker) {
				inSection = true;
				continue;
			}

			if (inSection) {
				// Next [[date]] marker ends this section
				if (/^\[\[\d{4}-\d{2}-\d{2}\]\]$/.test(trimmed)) break;
				// Separator ends section
				if (trimmed === '----') break;
				// Collect non-empty lines
				if (trimmed) result.push(trimmed);
			}
		}

		return result;
	}

	private async runAutoCreator(app: AppLike, today: string): Promise<void> {
		// Scan previous journal entry
		const prevJournal = await this.findPreviousJournalContent(app, today);
		if (prevJournal) {
			await this.autoCreator.createMissingFromContent(app as any, prevJournal, today, 'inbox');
		}

		// Scan all project files
		const projectFiles = app.vault.getFiles().filter((f: { path: string }) =>
			f.path.startsWith(this.settings.projectsFolder + '/') &&
			f.path.endsWith('.md')
		);
		for (const pf of projectFiles) {
			const handle = app.vault.getAbstractFileByPath(pf.path);
			if (!handle) continue;
			const content = await app.vault.read(handle);
			await this.autoCreator.createMissingFromContent(app as any, content, today, pf.path);
		}
	}

	private async findPreviousJournalContent(app: AppLike, today: string): Promise<string | null> {
		const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
		const journalFiles = app.vault.getFiles()
			.filter((f: { path: string; basename: string }) =>
				f.path.startsWith(this.settings.journalFolder + '/') &&
				DATE_RE.test(f.basename) &&
				f.basename < today
			)
			.sort((a: { basename: string }, b: { basename: string }) =>
				b.basename.localeCompare(a.basename)
			);

		if (journalFiles.length === 0) return null;
		const first = journalFiles[0];
		if (!first) return null;
		const handle = app.vault.getAbstractFileByPath(first.path);
		if (!handle) return null;
		return await app.vault.read(handle);
	}
}
