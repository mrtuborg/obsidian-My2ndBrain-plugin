const MONTH_NAMES = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STAGES = new Set(['doing', 'backlog', 'done']);

// Safety cap on any file the plugin writes or fully reprocesses. Activity
// files accumulate pasted content (test logs, specs, etc.) forever with no
// built-in archiving — past ~1MB, the vault-wide read/parse/rewrite this
// plugin does on every open becomes expensive enough to crash Obsidian's
// renderer. 720KB is a soft ceiling well below that danger zone.
export const MAX_MANAGED_FILE_BYTES = 720 * 1024;

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
		extraFields: Record<string, unknown> = {},
		project: string = '',
		role: string = '',
		takeToWork: boolean = false,
		takeToWorkDate: string = ''
	): string {
		// Validate date
		if (!DATE_RE.test(date) || isNaN(Date.parse(date))) {
			throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD.`);
		}

		// Validate stage
		if (!VALID_STAGES.has(stage)) {
			throw new Error(`Invalid stage "${stage}". Expected "doing", "backlog", or "done".`);
		}

		// Normalise responsible
		if (typeof responsible === 'string') responsible = [responsible];
		if (!Array.isArray(responsible) || !responsible.every(r => typeof r === 'string')) {
			throw new Error(`Invalid responsible. Expected an array of strings.`);
		}

		const lines = ['---', `startDate: ${date}`, `stage: ${stage}`];
		// takeToWork is mandatory on every activity — it is the single switch
		// deciding whether the activity shows up in today's daily note, so it
		// is always written, even when false. takeToWorkDate is optional and
		// only ever consumed by the Eisenhower Matrix for display/sorting.
		lines.push(`takeToWork: ${takeToWork ? 'true' : 'false'}`);
		if (DATE_RE.test(takeToWorkDate)) lines.push(`takeToWorkDate: ${takeToWorkDate}`);
		if (type && typeof type === 'string') lines.push(`type: ${type}`);
		lines.push(`responsible: [${responsible.join(', ')}]`);
		// project/role are always written, even blank — unlike arbitrary
		// "extra" fields below (which are dropped when empty), these are
		// meant to stay visible in every activity so the user can click in
		// and assign them (e.g. a brand-new activity scaffolded with an
		// empty role: for manual fill-in). Previously project was silently
		// dropped by every save because it was never actually threaded
		// through here — this restores it.
		lines.push(`project: ${project}`);
		lines.push(`role: ${role}`);

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

	/**
	 * Reads a frontmatter field as a boolean. Accepts true/false/yes/no/1/0
	 * (case-insensitive). Returns null when the field is absent or unparseable,
	 * so callers can distinguish "explicitly false" from "never set".
	 */
	parseFrontmatterBool(content: string, fieldName: string): boolean | null {
		const raw = this.parseFrontmatterField(content, fieldName);
		if (raw === null) return null;
		const v = raw.trim().toLowerCase().replace(/^["']|["']$/g, '');
		if (v === 'true' || v === 'yes' || v === '1') return true;
		if (v === 'false' || v === 'no' || v === '0') return false;
		return null;
	}

	/**
	 * Insert, replace, or remove a single scalar frontmatter field, leaving
	 * every other line byte-identical. Pure string surgery (D7) — deliberately
	 * not a YAML round-trip, because re-emitting the whole block would reorder
	 * and reformat fields the user hand-wrote.
	 *
	 * Pass `null` as the value to remove the field.
	 * A brand-new key is inserted after `afterKey` (default `stage`) when that
	 * key exists, otherwise appended at the end of the block.
	 */
	upsertFrontmatterField(
		content: string,
		fieldName: string,
		value: string | null,
		afterKey = 'stage'
	): string {
		const lines = content.split('\n');

		// Locate the frontmatter block. Only a document-leading '---' counts.
		if (lines[0] !== '---') {
			if (value === null) return content;
			return ['---', `${fieldName}: ${value}`, '---', '', content.trimStart()].join('\n');
		}
		let end = -1;
		for (let i = 1; i < lines.length; i++) {
			if (lines[i] === '---') { end = i; break; }
		}
		if (end === -1) return content;

		const keyOf = (line: string): string | null => {
			const idx = line.indexOf(':');
			if (idx === -1) return null;
			return line.slice(0, idx).trim();
		};

		for (let i = 1; i < end; i++) {
			if (keyOf(lines[i]!) !== fieldName) continue;
			if (value === null) {
				lines.splice(i, 1);
			} else {
				lines[i] = `${fieldName}: ${value}`;
			}
			return lines.join('\n');
		}

		if (value === null) return content;

		let insertAt = end;
		for (let i = 1; i < end; i++) {
			if (keyOf(lines[i]!) === afterKey) { insertAt = i + 1; break; }
		}
		lines.splice(insertAt, 0, `${fieldName}: ${value}`);
		return lines.join('\n');
	}

	/**
	 * Read → upsert each field → write. Used by the matrix buttons, which must
	 * touch exactly one frontmatter line so two devices editing different
	 * activities never produce a sync conflict.
	 */
	async updateFrontmatterFields(
		app: AppLike,
		filename: string,
		fields: Record<string, string | null>,
		afterKey = 'stage'
	): Promise<void> {
		const content = await this.loadFile(app, filename);
		if (content === null) return;
		if (this.exceedsSizeLimit(content)) {
			throw new Error(
				`Refusing to update frontmatter of ${filename}: file is over the ` +
				`${MAX_MANAGED_FILE_BYTES / 1024}KB safety limit.`
			);
		}

		let updated = content;
		for (const [key, value] of Object.entries(fields)) {
			updated = this.upsertFrontmatterField(updated, key, value, afterKey);
		}
		if (updated === content) return;

		await this.saveFile(app, filename, updated);
	}

	/** UTF-8 byte length (not JS string.length) — matters for Cyrillic/emoji-heavy vault content. */
	byteLength(content: string): number {
		return typeof Buffer !== 'undefined'
			? Buffer.byteLength(content, 'utf8')
			: new TextEncoder().encode(content).length;
	}

	/** True if content is over the safety ceiling for automated read/rewrite. */
	exceedsSizeLimit(content: string, limitBytes: number = MAX_MANAGED_FILE_BYTES): boolean {
		return this.byteLength(content) > limitBytes;
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

		// Last-resort guard: never let the plugin itself grow a file past the
		// safety ceiling, even if an earlier per-composer check was missed.
		if (this.exceedsSizeLimit(content)) {
			throw new Error(
				`Refusing to write ${filename}: content is ${(this.byteLength(content) / 1024).toFixed(0)}KB, ` +
				`over the ${MAX_MANAGED_FILE_BYTES / 1024}KB safety limit. Split or archive it manually.`
			);
		}

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
