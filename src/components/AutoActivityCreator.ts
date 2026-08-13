import { AppLike } from '../utilities/FileIO';

const DATE_PATTERNS = [
	/^\d{4}-\d{2}-\d{2}$/,   // YYYY-MM-DD
	/^\d{4}-W\d{2}$/,         // YYYY-Www
	/^\d{4}-\d{2}$/,          // YYYY-MM
	/^\d{4}$/,                 // YYYY
];

const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g;

// Characters that indicate a bash/shell expression rather than an Obsidian wikilink.
// Also includes ':' — invalid in Obsidian filenames on all platforms.
const SHELL_CHARS_RE = /[$"{}()\\<>;&|!`\n\t:]|^[-!]|^\s*$|^=/;

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
	 * @param role - pre-fills the created file's `role:` field (e.g. when the
	 *   scan runs against a Contexts/YYYY-MM-DD-<Role>.md page, so a brand
	 *   new activity typed there is already tagged with that role). Omit for
	 *   an empty `role: ` field the user can fill in by hand — e.g. when the
	 *   scan runs against the plain daily note, where no role is implied.
	 */
	async createMissingFromContent(
		app: AppLike,
		content: string,
		today: string,
		projectRef: string,
		role: string = ''
	): Promise<void> {
		const missing = this.extractMissingPaths(app, content);
		for (const path of missing) {
			await this.createActivityFile(app, path, today, projectRef, role);
		}
	}

	/**
	 * Populates a blank note (e.g. one Obsidian just created from clicking an
	 * unresolved wikilink outside the AutoActivityCreator scan path — a link
	 * typed directly into an Activity/People note, or clicked before the
	 * Journal pipeline re-ran) with the same default frontmatter used for
	 * links discovered via createMissingFromContent. No-ops if the file
	 * already has any content, so it never clobbers real notes.
	 */
	async initializeIfEmpty(
		app: AppLike,
		path: string,
		today: string,
		projectRef: string,
		role: string = ''
	): Promise<boolean> {
		const file = app.vault.getAbstractFileByPath(path);
		if (!file) return false;

		const content = await app.vault.read(file);
		if (content.trim().length > 0) return false;

		await app.vault.modify(file, this.generateDefaultContent(today, projectRef, role));
		return true;
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

			if (!this.fileExistsAnywhere(app, path)) {
				missing.push(path);
			}
		}

		return missing;
	}

	// Top-level vault folders where a "/" in a wikilink target genuinely means
	// a folder separator. Any other slash (e.g. a pasted Confluence/Notion
	// breadcrumb title like "Evaluation of new CPUs / SOMs") is not a real
	// vault path and must not be used to create folders at the vault root.
	private static readonly KNOWN_FOLDER_PREFIXES = ['Activities/', 'People/'];

	private resolveActivityPath(raw: string): string {
		// Strip a trailing #heading or #^block reference — [[Note#Section]] refers
		// to Note.md, not a literal file named "Note#Section.md".
		const hashIndex = raw.indexOf('#');
		let path = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
		path = path.endsWith('.md') ? path.slice(0, -3) : path;

		const isKnownFolder = AutoActivityCreator.KNOWN_FOLDER_PREFIXES.some(p => path.startsWith(p));
		if (path.includes('/') && !isKnownFolder) {
			// Flatten to the last segment — treat the rest as part of a pasted
			// title, not a folder path, so we never create bogus folders at
			// the vault root.
			path = path.slice(path.lastIndexOf('/') + 1).trim();
		}

		if (!path.includes('/')) path = 'Activities/' + path;
		return path + '.md';
	}

	/**
	 * Checks whether a note with this basename already exists anywhere in the
	 * vault (e.g. it was archived to Archived/YYYY/), not just at the exact
	 * Activities/ path. Prevents re-creating a blank stub for an already-archived
	 * activity when an old mention of it is reprocessed.
	 */
	private fileExistsAnywhere(app: AppLike, path: string): boolean {
		if (app.vault.getAbstractFileByPath(path)) return true;
		const basename = path.slice(path.lastIndexOf('/') + 1);
		return app.vault.getFiles().some(f => f.name === basename);
	}

	private async createActivityFile(
		app: AppLike,
		path: string,
		today: string,
		projectRef: string,
		role: string = ''
	): Promise<void> {
		try {
			const folderPath = path.substring(0, path.lastIndexOf('/'));
			if (folderPath && !app.vault.getAbstractFileByPath(folderPath)) {
				await app.vault.createFolder(folderPath);
			}

			await app.vault.create(path, this.generateDefaultContent(today, projectRef, role));
		} catch (err) {
			const msg = (err as Error).message ?? '';
			if (!msg.includes('already exists') && !msg.includes('File already exists')) {
				console.error(`AutoActivityCreator: Failed to create "${path}":`, err);
			}
			// Silently ignore "already exists" — idempotent
		}
	}

	/**
	 * `role` is always written — even blank — so the field is visible in
	 * the frontmatter for the user to click into and fill, rather than
	 * needing to know to add it themselves. Activities are now the source
	 * of truth for role (a Project can span many roles across its own
	 * activities), so this replaces relying solely on the linked Project's
	 * `role:` field.
	 */
	private generateDefaultContent(today: string, projectRef: string, role: string = ''): string {
		return [
			'---',
			`startDate: ${today}`,
			'stage: doing',
			'responsible: [Me]',
			'priority: not-urgent-important',
			'remind: weekdays',
			`project: ${projectRef}`,
			`role: ${role}`,
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
