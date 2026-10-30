import { PathNormalizer } from '../utilities/ActivityLinks';
import {
	dedupeGeneratedTodos,
	mergeBlockBodies,
	normalizeActionSets,
	reconcileRegions,
} from './ManagedRegions';

/**
 * Whole-Context repair of the `## Activities` section. Pure — no Obsidian API (D7).
 *
 * Collapses every set of blocks that name one Activity (any link spelling) into
 * a single canonical block, reconciles plugin-owned structure (marker ids,
 * managed regions, action sets) and keeps every unmarked user line. Nothing
 * outside the section — the plan region above it, `## Notes` below — is touched.
 * Idempotent: a repaired section repairs to itself.
 */

const HEADING_RE = /^#####\s+\[\[([^\]|]+)(?:\|([^\]]*))?\]\]\s*$/;
const SEPARATOR = '----';

interface Block { path: string; name: string; body: string[] }

export function repairActivitiesSection(content: string, normalize: PathNormalizer): string {
	const lines = content.split('\n');
	const start = lines.findIndex(l => /^## Activities\s*$/.test(l));
	if (start === -1) return content;
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		if (/^## /.test(lines[i]!)) { end = i; break; }
	}

	const preamble: string[] = [];
	const blocks: Block[] = [];
	let current: Block | null = null;
	let tail: string[] = [];
	const pending: string[] = [];
	for (const line of lines.slice(start + 1, end)) {
		const m = HEADING_RE.exec(line);
		if (m) {
			// Text typed between two blocks stays with the block above it.
			const prev = blocks[blocks.length - 1];
			if (prev) prev.body.push(...pending);
			pending.length = 0;
			current = { path: normalize(m[1]!.trim()), name: (m[2] ?? m[1]!).trim(), body: [] };
			blocks.push(current);
			tail = [];
			continue;
		}
		if (!current) {
			if (blocks.length === 0) preamble.push(line);
			else if (line.trim() !== SEPARATOR) pending.push(line);
			continue;
		}
		if (line.trim() === SEPARATOR) { current = null; tail = []; continue; }
		if (current) { current.body.push(line); continue; }
	}
	// Anything after the last separator that is not a block belongs to the tail.
	if (current === null && blocks.length > 0) {
		const lastSep = lastIndexOfSeparator(lines, start + 1, end);
		tail = lastSep === -1 ? [] : lines.slice(lastSep + 1, end);
	}
	if (blocks.length === 0) return content;

	const groups = new Map<string, Block[]>();
	for (const b of blocks) {
		const key = b.path.toLowerCase();
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)!.push(b);
	}

	const out: string[] = [...lines.slice(0, start + 1), ...preamble];
	for (const group of groups.values()) {
		const path = group[0]!.path;
		const body = group.length > 1
			? mergeBlockBodies(group.map(b => b.body), true)
			: reconcileRegions(group[0]!.body);
		const clean = normalizeActionSets(dedupeGeneratedTodos(body));
		const base = path.replace(/\.md$/i, '').split('/').pop()!;
		const name = group.length > 1 ? base : group[0]!.name;
		out.push(`##### [[${path}|${name}]]`, ...clean, SEPARATOR);
	}
	out.push(...tail, ...lines.slice(end));
	return out.join('\n');
}

function lastIndexOfSeparator(lines: string[], from: number, to: number): number {
	for (let i = to - 1; i >= from; i--) if (lines[i]!.trim() === SEPARATOR) return i;
	return -1;
}
