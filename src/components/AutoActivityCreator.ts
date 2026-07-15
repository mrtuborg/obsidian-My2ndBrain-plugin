import { AppLike } from '../utilities/FileIO';

const DATE_PATTERNS = [
	/^\d{4}-\d{2}-\d{2}$/,   // YYYY-MM-DD
	/^\d{4}-W\d{2}$/,         // YYYY-Www
	/^\d{4}-\d{2}$/,          // YYYY-MM
	/^\d{4}$/,                 // YYYY
];

const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g;

// Characters that indicate a bash/shell expression rather than an Obsidian wikilink.
const SHELL_CHARS_RE = /[$"{}()\\<>;&|!`\n\t]|^[-!]|^\s*$|^=/;

// Uppercase-only format placeholders like YYYY-MM-DD, DD, MMMM, etc.
const FORMAT_PLACEHOLDER_RE = /^[A-Z][A-Z\-_]+$/;

// File extensions that indicate an attachment/embed, not a note.
const ATTACHMENT_EXT_RE = /\.(png|jpg|jpeg|gif|svg|webp|pdf|mp4|mp3|wav|ogg|zip|tar|gz|json|csv|txt|js|ts|py|sh)$/i;

// A valid Obsidian wikilink target must look like a note name.
function isValidWikiTarget(raw: string): boolean {
	if (!raw || raw.length < 2) return false;
	if (SHELL_CHARS_RE.test(raw)) return false;
	if (FORMAT_PLACEHOLDER_RE.test(raw)) return false;
	if (ATTACHMENT_EXT_RE.test(raw)) return false;
	if (!/\w/.test(raw)) return false;
	return true;
}

/** Strip fenced code blocks (```...```) and inline code spans (`...`) so
 * bash [[ ]] and example wikilinks inside them are ignored. */
function stripCodeBlocks(content: string): string {
	return content
		.replace(/```[\s\S]*?```/g, '')    // fenced blocks
		.replace(/`[^`\n]+`/g, '');         // inline code spans
}

export class AutoActivityCreator {

	/**
	 * Scans `content` for unresolved wikilinks and creates Activity files for each.
	 * @param projectRef - "inbox" or "Projects/Name.md" — written into the created file's frontmatter
	 */
	async createMissingFromContent(
		app: AppLike,
		content: string,
		today: string,
		projectRef: string
	): Promise<void> {
		const missing = this.extractMissingPaths(app, content);
		for (const path of missing) {
			await this.createActivityFile(app, path, today, projectRef);
		}
	}

	// ── Private ──────────────────────────────────────────────────────────────

	private extractMissingPaths(app: AppLike, content: string): string[] {
		const seen = new Set<string>();
		const missing: string[] = [];

		// Strip code blocks so bash [[ ]] test syntax is never treated as wikilinks
		const cleanedContent = stripCodeBlocks(content)
			// Also strip Obsidian embeds ![[...]] — images/attachments, not note links
			.replace(/!\[\[[^\]]*\]\]/g, '');

		let m: RegExpExecArray | null;
		const re = new RegExp(WIKILINK_RE.source, 'g');
		while ((m = re.exec(cleanedContent)) !== null) {
			const raw = m[1]!.trim();
			if (!raw) continue;
			if (DATE_PATTERNS.some(p => p.test(raw))) continue;
			if (raw.startsWith('Projects/')) continue;
			// Reject shell/bash expressions — only accept valid Obsidian note names
			if (!isValidWikiTarget(raw)) continue;

			const path = this.resolveActivityPath(raw);
			if (seen.has(path)) continue;
			seen.add(path);

			if (!app.vault.getAbstractFileByPath(path)) {
				missing.push(path);
			}
		}

		return missing;
	}

	private resolveActivityPath(raw: string): string {
		let path = raw.endsWith('.md') ? raw.slice(0, -3) : raw;
		if (!path.includes('/')) path = 'Activities/' + path;
		return path + '.md';
	}

	private async createActivityFile(
		app: AppLike,
		path: string,
		today: string,
		projectRef: string
	): Promise<void> {
		try {
			const folderPath = path.substring(0, path.lastIndexOf('/'));
			if (folderPath && !app.vault.getAbstractFileByPath(folderPath)) {
				await app.vault.createFolder(folderPath);
			}

			await app.vault.create(path, this.generateDefaultContent(today, projectRef));
		} catch (err) {
			const msg = (err as Error).message ?? '';
			if (!msg.includes('already exists') && !msg.includes('File already exists')) {
				console.error(`AutoActivityCreator: Failed to create "${path}":`, err);
			}
			// Silently ignore "already exists" — idempotent
		}
	}

	private generateDefaultContent(today: string, projectRef: string): string {
		return [
			'---',
			`startDate: ${today}`,
			'stage: active',
			'responsible: [Me]',
			'priority: medium',
			'remind: weekdays',
			'quality: draft',
			'context_refs: []',
			'wiki: ""',
			`project: ${projectRef}`,
			'---',
			'',
			'## Description',
			'',
			'----',
			'',
			'## Journal',
			'',
			'----',
		].join('\n');
	}
}
