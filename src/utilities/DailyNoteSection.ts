const HEADING_RE = /^#####\s+\[\[([^\]|]+)(?:\|([^\]]*))?\]\]\s*$/;
const SEPARATOR = '----';

export interface ActivityBlock {
	/** Vault path from the wikilink, e.g. "Activities/Foo.md". */
	path: string;
	/** Display name after the pipe, falling back to the path. */
	name: string;
	/** The heading line, verbatim. */
	heading: string;
	/** Lines between the heading and the next separator, verbatim. */
	body: string[];
}

/**
 * Splits a daily note's Activities section into its per-activity blocks.
 *
 * The rendered shape is a heading followed by that activity's open todos,
 * terminated by a `----` separator:
 *
 *     ##### [[Activities/Foo.md|Foo]]
 *     - [ ] something
 *     ----
 *
 * Anything outside a block (the header, the built marker, the user's own
 * writing further down the note) is ignored here — callers that need to
 * rewrite the note use `removeEmptyActivityBlock`, which works on the whole
 * document and preserves everything it does not recognise.
 */
export function parseActivityBlocks(content: string): ActivityBlock[] {
	const lines = content.split('\n');
	const blocks: ActivityBlock[] = [];
	let current: ActivityBlock | null = null;

	for (const line of lines) {
		const match = HEADING_RE.exec(line);
		if (match) {
			if (current) blocks.push(current);
			const path = match[1]!.trim();
			current = { path, name: (match[2] ?? path).trim(), heading: line, body: [] };
			continue;
		}

		if (!current) continue;

		if (line.trim() === SEPARATOR) {
			blocks.push(current);
			current = null;
			continue;
		}

		current.body.push(line);
	}

	if (current) blocks.push(current);
	return blocks;
}

/**
 * Whether the user (or a sync) put anything real under this heading. Blank
 * lines don't count — a freshly rendered activity with no open todos is an
 * empty block, and is the only kind safe to remove automatically.
 */
export function blockHasContent(block: ActivityBlock): boolean {
	return block.body.some(line => line.trim().length > 0);
}

/**
 * Removes one activity's block from a daily note, but only when that block is
 * empty. A block with content is the record of what actually happened that
 * day, and the Journal is the source of truth — no button may delete it.
 *
 * Returns the rewritten note, or `null` when nothing changed (block absent,
 * or present but non-empty), so callers can skip a pointless write.
 */
export function removeEmptyActivityBlock(
	content: string,
	activityPath: string
): string | null {
	const result = removeBlocks(content, [activityPath], true);
	return result.removed ? result.content : null;
}

/**
 * Removes the blocks for the given activities outright, empty or not.
 *
 * Used when a freshly rendered section has already absorbed those blocks
 * verbatim: leaving the originals behind would duplicate them.
 */
export function stripActivityBlocks(content: string, activityPaths: string[]): string {
	if (activityPaths.length === 0) return content;
	return removeBlocks(content, activityPaths, false).content;
}

function removeBlocks(
	content: string,
	activityPaths: string[],
	onlyWhenEmpty: boolean
): { content: string; removed: boolean } {
	const targets = new Set(activityPaths.map(p => p.trim().toLowerCase()));
	const lines = content.split('\n');
	const out: string[] = [];
	let removed = false;

	for (let i = 0; i < lines.length; i++) {
		const match = HEADING_RE.exec(lines[i]!);
		if (!match || !targets.has(match[1]!.trim().toLowerCase())) {
			out.push(lines[i]!);
			continue;
		}

		// Collect the block so we can decide whether it is safe to drop.
		const body: string[] = [];
		let j = i + 1;
		while (j < lines.length && lines[j]!.trim() !== SEPARATOR) {
			body.push(lines[j]!);
			j++;
		}

		if (onlyWhenEmpty && body.some(l => l.trim().length > 0)) {
			out.push(lines[i]!);
			continue;
		}

		// Drop the heading, its body, and the separator that closed it.
		i = j;
		removed = true;
	}

	return { content: out.join('\n'), removed };
}
