const MONTH_NAMES = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STAGES = new Set(['active', 'done']);

export interface VaultFile {
	path: string;
	name: string;
	basename: string;
}

export interface AppLike {
	vault: {
		getAbstractFileByPath(path: string): VaultFile | null;
		read(file: { path: string }): Promise<string>;
		modify(file: { path: string }, content: string): Promise<void>;
		getFiles(): VaultFile[];
		create(path: string, content: string): Promise<unknown>;
		createFolder(path: string): Promise<unknown>;
	};
	metadataCache?: {
		getFileCache(file: { path: string }): unknown;
	};
}

export class FileIO {

	todayDate(): string {
		return new Date().toISOString().slice(0, 10);
	}

	isDailyNote(fileName: string): boolean {
		return fileName === this.todayDate();
	}

	generateActivityHeader(
		date: string,
		stage: string,
		responsible: string | string[],
		type: string | null = null,
		extraFields: Record<string, unknown> = {}
	): string {
		// Validate date
		if (!DATE_RE.test(date) || isNaN(Date.parse(date))) {
			throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD.`);
		}

		// Validate stage
		if (!VALID_STAGES.has(stage)) {
			throw new Error(`Invalid stage "${stage}". Expected "active" or "done".`);
		}

		// Normalise responsible
		if (typeof responsible === 'string') responsible = [responsible];
		if (!Array.isArray(responsible) || !responsible.every(r => typeof r === 'string')) {
			throw new Error(`Invalid responsible. Expected an array of strings.`);
		}

		const lines = ['---', `startDate: ${date}`, `stage: ${stage}`];
		if (type && typeof type === 'string') lines.push(`type: ${type}`);
		lines.push(`responsible: [${responsible.join(', ')}]`);

		// Extra fields — skip empty strings
		for (const [key, val] of Object.entries(extraFields)) {
			if (val === '' || val === null || val === undefined) continue;
			if (Array.isArray(val)) {
				lines.push(`${key}:`);
				for (const item of val) lines.push(`  - ${item}`);
			} else {
				lines.push(`${key}: ${val}`);
			}
		}

		lines.push('---');
		return lines.join('\n');
	}

	generateDailyNoteHeader(title: string): string {
		const [year, month, day] = title.split('-').map(Number) as [number, number, number];
		const date = new Date(year, month - 1, day);

		const mm = String(month).padStart(2, '0');
		const dd = String(day).padStart(2, '0');
		const monthName = MONTH_NAMES[month - 1]!;

		const { weekYear, weekNum } = this.getISOWeek(date);
		const ww = String(weekNum).padStart(2, '0');
		const weekLink = `${weekYear}-W${ww}`;

		return [
			'---',
			'---',
			`### ${dd} [[${year}-${mm}|${monthName}]] [[${year}]]`,
			`#### Week: [[${weekLink}|${ww}]]`,
		].join('\n');
	}

	extractFrontmatterAndDataviewJs(content: string): {
		frontmatter: string;
		dataviewJsBlock: string;
		pageContent: string;
	} {
		const lines = content.split('\n');
		let frontmatter = '';
		let dataviewJsBlock = '';
		let remaining = content.trim();

		// Extract frontmatter
		if (lines[0] === '---') {
			for (let i = 1; i < lines.length; i++) {
				if (lines[i] === '---') {
					frontmatter = lines.slice(0, i + 1).join('\n').trim();
					remaining = lines.slice(i + 1).join('\n').trim();
					break;
				}
			}
		}

		// Extract leading dataviewjs block
		if (remaining.startsWith('```dataviewjs')) {
			const blockLines = remaining.split('\n');
			let end = -1;
			for (let i = 1; i < blockLines.length; i++) {
				if (blockLines[i]!.startsWith('```')) { end = i; break; }
			}
			if (end !== -1) {
				dataviewJsBlock = blockLines.slice(0, end + 1).join('\n').trim();
				remaining = blockLines.slice(end + 1).join('\n').trim();
			}
		}

		return {
			frontmatter: frontmatter || '',
			dataviewJsBlock: dataviewJsBlock || '',
			pageContent: remaining || '',
		};
	}

	parseFrontmatterField(content: string, fieldName: string): string | null {
		if (!content || typeof content !== 'string') return null;

		const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!fmMatch) return null;

		const fmBody = fmMatch[1]!;
		for (const line of fmBody.split('\n')) {
			const colonIdx = line.indexOf(':');
			if (colonIdx === -1) continue;
			const key = line.slice(0, colonIdx).trim();
			if (key === fieldName) {
				return line.slice(colonIdx + 1).trim() || null;
			}
		}
		return null;
	}

	parseExtraFrontmatterFields(
		content: string,
		standardFields: Set<string>
	): Record<string, unknown> {
		if (!content || typeof content !== 'string') return {};

		const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!fmMatch) return {};

		const fmLines = fmMatch[1]!.split('\n');
		const result: Record<string, unknown> = {};
		let i = 0;

		while (i < fmLines.length) {
			const line = fmLines[i]!;
			const colonIdx = line.indexOf(':');
			if (colonIdx === -1) { i++; continue; }

			const key = line.slice(0, colonIdx).trim();
			const rest = line.slice(colonIdx + 1).trim();

			if (standardFields.has(key)) { i++; continue; }

			// Inline sequence: key: [a, b]
			if (rest.startsWith('[') && rest.endsWith(']')) {
				const items = rest.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
				result[key] = items;
				i++;
				continue;
			}

			// Block list: next lines are "  - item"
			if (rest === '') {
				const items: string[] = [];
				i++;
				while (i < fmLines.length && fmLines[i]!.match(/^\s+- /)) {
					items.push(fmLines[i]!.replace(/^\s+- /, '').trim());
					i++;
				}
				result[key] = items.length > 0 ? items : '';
				continue;
			}

			// Scalar
			result[key] = rest;
			i++;
		}

		return result;
	}

	async loadFile(app: AppLike, filename: string): Promise<string | null> {
		const file = app.vault.getAbstractFileByPath(filename);
		if (!file) {
			console.error('File not found:', filename);
			return null;
		}
		return await app.vault.read(file);
	}

	async saveFile(app: AppLike, filename: string, content: string): Promise<void> {
		if (!content || content.trim().length === 0) return;

		const file = app.vault.getAbstractFileByPath(filename);
		if (!file) {
			console.error('File not found:', filename);
			return;
		}

		if (app.metadataCache) {
			app.metadataCache.getFileCache(file);
		}

		await app.vault.modify(file, content);
	}

	// ── Private helpers ──────────────────────────────────────────────

	private getISOWeek(date: Date): { weekYear: number; weekNum: number } {
		const d = new Date(date);
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() + 4 - (d.getDay() || 7));
		const yearStart = new Date(d.getFullYear(), 0, 1);
		const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
		return { weekYear: d.getFullYear(), weekNum };
	}
}
