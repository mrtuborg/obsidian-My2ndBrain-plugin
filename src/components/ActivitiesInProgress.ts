import { FileIO, AppLike, VaultFile } from '../utilities/FileIO';
import { NoteBlocksParser } from './NoteBlocksParser';

const ACTIVITIES_FOLDER = 'Activities';
const ARCHIVE_FOLDER = 'Activities/Archive';

export interface ActivitiesSettings {
	activitiesFolder: string;
	archiveFolder: string;
}

const TYPE_PRIORITY: Record<string, number> = {
	project: 1,
	inbox: 999,
};
const PRIORITY_ORDER: Record<string, number> = {
	'urgent-important': 1,
	'urgent-not-important': 2,
	'not-urgent-important': 3,
	'not-urgent-not-important': 4,
	high: 1,
	medium: 3,
	low: 4,
};

export class ActivitiesInProgress {
	private fileIO = new FileIO();
	private parser = new NoteBlocksParser();
	private activitiesFolder: string;
	private archiveFolder: string;

	constructor(settings?: ActivitiesSettings) {
		this.activitiesFolder = settings?.activitiesFolder ?? ACTIVITIES_FOLDER;
		this.archiveFolder = settings?.archiveFolder ?? ARCHIVE_FOLDER;
	}

	async run(app: AppLike, _existingPageContent: string): Promise<string> {
		const today = this.fileIO.todayDate();
		const files = app.vault.getFiles().filter(f =>
			f.path.startsWith(this.activitiesFolder + '/') &&
			!f.path.startsWith(this.archiveFolder + '/') &&
			!f.path.startsWith(this.activitiesFolder + '/Workflow/') &&
			f.path.endsWith('.md')
		);

		const activities = await this.filterActivities(app, files, today);
		if (activities.length === 0) return '';

		return this.renderSection(activities);
	}

	// ── Private ──────────────────────────────────────────────────────────────

	private async filterActivities(
		app: AppLike,
		files: VaultFile[],
		today: string
	): Promise<Array<{ file: VaultFile; content: string; openTodos: string[] }>> {
		const results = [];

		for (const file of files) {
			const fileHandle = app.vault.getAbstractFileByPath(file.path);
			if (!fileHandle) continue;

			// Critical: read from raw file content, NOT metadataCache (invariant B.2.5)
			const content = await app.vault.read(fileHandle);

			// Only include explicitly active activities (not planning, inbox, backlog, done, etc.)
			const stage = this.fileIO.parseFrontmatterField(content, 'stage');
			if (stage !== 'doing') continue;

			// Require a valid YYYY-MM-DD startDate — excludes template files with
			// Templater placeholders like <% tp.date.now() %> and files with no date at all
			const startDate = this.fileIO.parseFrontmatterField(content, 'startDate');
			if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) continue;
			if (startDate > today) continue;

			const remind = this.fileIO.parseFrontmatterField(content, 'remind') ?? 'daily';
			if (!this.remindAllowsToday(remind)) continue;

			const openTodos = this.extractOpenTodos(content);
			results.push({ file, content, openTodos });
		}

		// Sort: type priority → priority field → startDate → filename
		results.sort((a, b) => {
			const typeA = this.fileIO.parseFrontmatterField(a.content, 'type') ?? 'project';
			const typeB = this.fileIO.parseFrontmatterField(b.content, 'type') ?? 'project';
			const tpA = TYPE_PRIORITY[typeA] ?? 50;
			const tpB = TYPE_PRIORITY[typeB] ?? 50;
			if (tpA !== tpB) return tpA - tpB;

			const prioA = PRIORITY_ORDER[this.fileIO.parseFrontmatterField(a.content, 'priority') ?? 'medium'] ?? 2;
			const prioB = PRIORITY_ORDER[this.fileIO.parseFrontmatterField(b.content, 'priority') ?? 'medium'] ?? 2;
			if (prioA !== prioB) return prioA - prioB;

			const sdA = this.fileIO.parseFrontmatterField(a.content, 'startDate') ?? '';
			const sdB = this.fileIO.parseFrontmatterField(b.content, 'startDate') ?? '';
			if (sdA !== sdB) return sdA < sdB ? -1 : 1;

			return a.file.basename.localeCompare(b.file.basename);
		});

		return results;
	}

	private extractOpenTodos(content: string): string[] {
		// Walk lines and collect only those in the ## Journal section
		const lines = content.split('\n');
		let inJournal = false;
		const journalLines: string[] = [];

		for (const line of lines) {
			if (/^## Journal\s*$/.test(line)) { inJournal = true; continue; }
			if (inJournal && /^## /.test(line)) break;
			if (inJournal) journalLines.push(line);
		}

		// Collect all open todo lines
		const openLines = journalLines
			.filter(l => /^\s*- \[ \] /.test(l))
			.map(l => l.trim());

		// Collect all done task texts
		const doneTexts = new Set(
			journalLines
				.filter(l => /^\s*- \[x\] /.test(l))
				.map(l => l.trim().slice('- [x] '.length))
		);

		// Filter out todos whose text has a matching done entry,
		// and deduplicate — same todo text may appear across many journal date-sections
		const seen = new Set<string>();
		return openLines.filter(l => {
			const text = l.slice('- [ ] '.length);
			if (doneTexts.has(text)) return false;
			if (seen.has(text)) return false;
			seen.add(text);
			return true;
		});
	}

	private remindAllowsToday(remind: string): boolean {
		const now = new Date();
		const day = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
		switch (remind) {
			case 'weekdays': return day >= 1 && day <= 5;
			case 'weekends': return day === 0 || day === 6;
			case 'monday':   return day === 1;
			case 'tuesday':  return day === 2;
			case 'wednesday':return day === 3;
			case 'thursday': return day === 4;
			case 'friday':   return day === 5;
			case 'saturday': return day === 6;
			case 'sunday':   return day === 0;
			default: {
				// YYYY-MM or YYYY-MM-DD — show only from that date onward
				if (/^\d{4}-\d{2}(-\d{2})?$/.test(remind)) {
					const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
					const threshold = remind.length === 7 ? remind + '-01' : remind;
					return todayStr >= threshold;
				}
				return true; // daily or unknown
			}
		}
	}

	private renderSection(
		activities: Array<{ file: VaultFile; openTodos: string[] }>
	): string {
		const lines: string[] = ['----', '', '### Activities:', '----'];

		for (const { file, openTodos } of activities) {
			const displayName = file.basename;
			lines.push(`##### [[${file.path}|${displayName}]]`);
			for (const todo of openTodos) {
				lines.push(todo);
			}
			lines.push('----');
		}

		return lines.join('\n');
	}
}
