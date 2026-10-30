/**
 * Automation-managed regions inside an Activity block, and the stable
 * identity of the todos generated into them. Pure — no Obsidian API (D7).
 *
 * An Activity block on a Context page is
 *
 *     ##### [[Activities/X.md|X]]
 *     <!-- 2ndbrain:managed:morning:start -->   ← replaceable, one per kind
 *     ...
 *     <!-- 2ndbrain:managed:morning:end -->
 *     <!-- 2ndbrain:managed:evening:start -->
 *     ...
 *     <!-- 2ndbrain:managed:evening:end -->
 *     ...whatever the user wrote...             ← never touched
 *     ----
 *
 * Each kind is replaced independently, so the evening review cannot erase
 * the morning snapshot and neither can erase a line the user typed.
 */

export const MANAGED_KINDS = ['morning', 'evening', 'board'] as const;
export type ManagedKind = typeof MANAGED_KINDS[number];

const START_RE = /^<!-- 2ndbrain:managed:([a-z]+):start -->\s*$/;
const END_RE = /^<!-- 2ndbrain:managed:([a-z]+):end -->\s*$/;
const TODO_ID_RE = /<!-- 2ndbrain:todo:(.*?) -->\s*$/;
// The plan overview sits on the Context page itself, outside any Activity block.
const PLAN_MARKER_RE = /^<!-- 2ndbrain:plan:[a-z]+:\d{4}-\d{2}-\d{2}:[A-Za-z]+:(start|end) -->\s*$/;

export function regionStart(kind: ManagedKind): string {
	return `<!-- 2ndbrain:managed:${kind}:start -->`;
}

export function regionEnd(kind: ManagedKind): string {
	return `<!-- 2ndbrain:managed:${kind}:end -->`;
}

/** Marker line of any kind — used by the parser to keep regions out of the Journal. */
export function isRegionMarker(line: string): boolean {
	return START_RE.test(line) || END_RE.test(line) || PLAN_MARKER_RE.test(line);
}

/**
 * Makes arbitrary text safe to embed as one line of managed content: no
 * wikilinks (the plugin turns unresolved wikilinks into Activity stubs),
 * no comment delimiters, no block separators, no accidental todo syntax.
 */
export function sanitizeLine(text: string): string {
	return text
		.replace(/\r?\n/g, ' ')
		.replace(/\[\[/g, '[')
		.replace(/\]\]/g, ']')
		.replace(/<!--/g, '<!- -')
		.replace(/-->/g, '- ->')
		.replace(/^\s*-{3,}\s*$/, '—')
		.trimEnd();
}

/** A summary line: sanitised, and never mistaken for a todo or heading by the parser. */
export function sanitizeSummaryLine(text: string): string {
	const line = sanitizeLine(text);
	return line.replace(/^(\s*)- \[[ xX]\]/, '$1- ');
}

interface Range { start: number; end: number }

/** Index range of a region's marker lines (inclusive), or null. */
function findRegion(lines: string[], kind: ManagedKind): Range | null {
	let start = -1;
	for (let i = 0; i < lines.length; i++) {
		const s = START_RE.exec(lines[i]!);
		if (s && s[1] === kind) { start = i; continue; }
		const e = END_RE.exec(lines[i]!);
		if (e && e[1] === kind && start !== -1) return { start, end: i };
	}
	return null;
}

export function extractRegion(body: string[], kind: ManagedKind): string[] | null {
	const range = findRegion(body, kind);
	return range ? body.slice(range.start + 1, range.end) : null;
}

/**
 * Replaces (or inserts) one kind's region, leaving every other line alone.
 * A new region is placed after the nearest existing region that precedes it
 * in MANAGED_KINDS order, else directly under the heading — above the
 * user's own lines, so a block reads snapshot → review → notes.
 */
export function replaceRegion(body: string[], kind: ManagedKind, content: string[]): string[] {
	const fresh = [regionStart(kind), ...content, regionEnd(kind)];
	const existing = findRegion(body, kind);
	if (existing) {
		return [...body.slice(0, existing.start), ...fresh, ...body.slice(existing.end + 1)];
	}

	let insertAt = 0;
	for (const earlier of MANAGED_KINDS.slice(0, MANAGED_KINDS.indexOf(kind))) {
		const range = findRegion(body, earlier);
		if (range) insertAt = Math.max(insertAt, range.end + 1);
	}
	return [...body.slice(0, insertAt), ...fresh, ...body.slice(insertAt)];
}

// ── Todo identity ──────────────────────────────────────────────────────────

export interface ManagedTodo {
	/** Stable identity — `<action>@<canonical source url>` or `custom:<key>`. */
	id: string;
	/** Human-readable text, rebuilt from the Activity's current title on each run. */
	text: string;
}

export function encodeTodoId(id: string): string {
	return id.replace(/--/g, '-%2D');
}

export function renderManagedTodo(todo: ManagedTodo, checked: boolean): string {
	return `- [${checked ? 'x' : ' '}] ${sanitizeLine(todo.text)} <!-- 2ndbrain:todo:${encodeTodoId(todo.id)} -->`;
}

/** The identity carried by a generated todo line, or null for any other line. */
export function parseTodoId(line: string): string | null {
	const m = TODO_ID_RE.exec(line);
	return m ? m[1]! : null;
}

function isChecked(line: string): boolean {
	return /^\s*- \[[xX]\]/.test(line);
}

/**
 * Builds the todo lines of a region from the freshly derived todos while
 * keeping the checkbox state the user already set:
 *
 *  - an id seen before keeps its `[x]`/`[ ]`, but takes the new text — so a
 *    renamed Activity updates the wording and never duplicates the line;
 *  - a ticked line whose evidence has since gone stays (it is a record of
 *    work done); an unticked one is dropped (its evidence is gone).
 */
export function mergeManagedTodos(existing: string[], fresh: ManagedTodo[]): string[] {
	const state = new Map<string, boolean>();
	const orphanDone: string[] = [];
	const freshIds = new Set(fresh.map(t => encodeTodoId(t.id)));

	for (const line of existing) {
		const id = parseTodoId(line);
		if (id === null) continue;
		state.set(id, isChecked(line));
		if (isChecked(line) && !freshIds.has(id) && !orphanDone.some(l => parseTodoId(l) === id)) {
			orphanDone.push(line);
		}
	}

	const seen = new Set<string>();
	const out: string[] = [];
	for (const todo of fresh) {
		const key = encodeTodoId(todo.id);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(renderManagedTodo(todo, state.get(key) ?? false));
	}
	return [...out, ...orphanDone];
}

/**
 * Collapses duplicate generated todos across a whole Activity block. The
 * marker is the identity, so a second line with the same id is never a second
 * task — wherever it sits.
 *
 *  - per region kind the first copy of an id is kept;
 *  - a copy outside every region (legacy placement) folds into the first
 *    region copy when one exists, else the first outside copy is kept;
 *  - a survivor is ticked if any copy it absorbed was ticked, so state is
 *    never lost.
 *
 * Lines without a marker — the user's own — are never touched.
 */
export function dedupeGeneratedTodos(lines: string[]): string[] {
	interface Copy { idx: number; scope: string | null; checked: boolean }
	const byId = new Map<string, Copy[]>();
	let scope: string | null = null;
	lines.forEach((line, idx) => {
		const s = START_RE.exec(line);
		if (s) { scope = s[1]!; return; }
		if (END_RE.test(line)) { scope = null; return; }
		const id = parseTodoId(line);
		if (id === null) return;
		if (!byId.has(id)) byId.set(id, []);
		byId.get(id)!.push({ idx, scope, checked: isChecked(line) });
	});

	const drop = new Set<number>();
	const tick = new Set<number>();
	for (const copies of byId.values()) {
		if (copies.length < 2) continue;
		const survivors = new Map<string | null, Copy>();
		for (const c of copies) {
			if (c.scope !== null && !survivors.has(c.scope)) survivors.set(c.scope, c);
		}
		const outside = copies.filter(c => c.scope === null);
		if (survivors.size === 0 && outside.length > 0) survivors.set(null, outside[0]!);
		const kept = [...survivors.values()].sort((a, b) => a.idx - b.idx);
		for (const c of copies) if (!kept.includes(c)) drop.add(c.idx);
		kept.forEach((sv, n) => {
			const absorbed = copies.some(c => c.checked && (c.scope === sv.scope || (n === 0 && c.scope === null)));
			if (absorbed && !sv.checked) tick.add(sv.idx);
		});
	}
	if (drop.size === 0 && tick.size === 0) return lines;
	return lines
		.map((l, i) => (tick.has(i) ? l.replace(/^(\s*- )\[ \]/, '$1[x]') : l))
		.filter((_, i) => !drop.has(i));
}

/** Lines of a region that are not generated todos (the summary prose). */
export function nonTodoLines(region: string[]): string[] {
	return region.filter(l => parseTodoId(l) === null);
}

// ── Reconciling duplicated / damaged blocks ────────────────────────────────

const isKind = (k: string): k is ManagedKind => (MANAGED_KINDS as readonly string[]).includes(k);

/**
 * Leaves exactly one well-formed region per kind. A body that already has that
 * shape is returned untouched unless `force`; otherwise duplicate regions of a
 * kind are folded into one (lines kept, exact repeats and repeated generated
 * ids collapsed), nested/unclosed/stray markers are repaired, and the regions
 * are placed in MANAGED_KINDS order above the remaining lines. No line that is
 * not a marker or a repeat is ever dropped.
 */
export function reconcileRegions(body: string[], force = false): string[] {
	const regions: Array<{ kind: ManagedKind; lines: string[] }> = [];
	const outside: string[] = [];
	let open: { kind: ManagedKind; lines: string[] } | null = null;
	let clean = true;

	for (const line of body) {
		const s = START_RE.exec(line);
		if (s && isKind(s[1]!)) {
			if (open) { clean = false; regions.push(open); }
			open = { kind: s[1] as ManagedKind, lines: [] };
			continue;
		}
		const e = END_RE.exec(line);
		if (e && isKind(e[1]!)) {
			if (open && open.kind === e[1]) { regions.push(open); open = null; }
			else clean = false;
			continue;
		}
		(open ? open.lines : outside).push(line);
	}
	if (open) { clean = false; regions.push(open); }

	const kinds = regions.map(r => r.kind);
	if (clean && new Set(kinds).size === kinds.length && !force) return body;

	const out: string[] = [];
	for (const kind of MANAGED_KINDS) {
		const same = regions.filter(r => r.kind === kind);
		if (same.length === 0) continue;
		const seen = new Set<string>();
		const merged: string[] = [];
		for (const line of same.flatMap(r => r.lines)) {
			const t = line.trim();
			if (t !== '' && parseTodoId(line) === null) {
				if (seen.has(t)) continue;
				seen.add(t);
			}
			merged.push(line);
		}
		out.push(regionStart(kind), ...dedupeGeneratedTodos(merged), regionEnd(kind));
	}
	return [...out, ...outside];
}

/**
 * Joins the bodies of several blocks that name the same Activity into one.
 * Every unmarked line outside a managed region is kept in original order, even
 * an exact repeat — it is the user's. Only plugin-owned structure is
 * reconciled: generated todos by marker (checked wins) and duplicate regions.
 */
export function mergeBlockBodies(bodies: string[][], keepBlanks = false): string[] {
	const out: string[] = [];
	for (const raw of bodies) {
		const body = [...raw];
		if (!keepBlanks) while (body.length > 0 && body[body.length - 1]!.trim() === '') body.pop();
		out.push(...body);
	}
	return dedupeGeneratedTodos(reconcileRegions(out, true));
}

const ACTION_ID_RE = /^(review|fix-ci|address-feedback|resolve-conflicts|merge|unblock|continue|follow-up)@(.+)$/;
const GENERIC_ACTIONS = new Set(['continue', 'follow-up']);
const BLOCKER_ACTIONS = new Set(['fix-ci', 'address-feedback', 'resolve-conflicts']);

/**
 * One coherent action set per canonical source URL. Only unticked generated
 * todos are ever removed — ticked ones are history, unmarked ones are the
 * user's, custom ones carry no URL.
 *
 *  - any specific action suppresses the generic `continue` / `follow-up`;
 *  - while a blocker (fix-ci, address-feedback, resolve-conflicts) is open,
 *    `merge` is suppressed;
 *  - several independent specific actions all stay.
 */
export function normalizeActionSets(lines: string[]): string[] {
	const open = new Map<string, Set<string>>();
	for (const line of lines) {
		const id = parseTodoId(line);
		const m = id === null || isChecked(line) ? null : ACTION_ID_RE.exec(id);
		if (!m) continue;
		if (!open.has(m[2]!)) open.set(m[2]!, new Set());
		open.get(m[2]!)!.add(m[1]!);
	}
	const suppressed = (action: string, url: string): boolean => {
		const set = open.get(url);
		if (!set) return false;
		const specific = [...set].some(a => !GENERIC_ACTIONS.has(a));
		if (GENERIC_ACTIONS.has(action)) return specific;
		return action === 'merge' && [...set].some(a => BLOCKER_ACTIONS.has(a));
	};
	return lines.filter(line => {
		const id = parseTodoId(line);
		const m = id === null || isChecked(line) ? null : ACTION_ID_RE.exec(id);
		return !(m && suppressed(m[1]!, m[2]!));
	});
}

/** Rewrites the wording of every generated todo whose id is in `fresh`; checkbox state is kept. */
export function refreshGeneratedText(lines: string[], fresh: ManagedTodo[]): string[] {
	const text = new Map(fresh.map(t => [encodeTodoId(t.id), t.text]));
	return lines.map(line => {
		const id = parseTodoId(line);
		const want = id === null ? undefined : text.get(id);
		if (want === undefined || want === '') return line;
		const m = /^(\s*- \[[ xX]\] )/.exec(line);
		return m ? `${m[1]}${sanitizeLine(want)} <!-- 2ndbrain:todo:${id} -->` : line;
	});
}

/**
 * Drops unticked generated todos that sit outside every region, name a source
 * URL the current upsert covers, and are not among its todos: the upsert
 * supersedes them. Ticked lines and todos for other URLs stay.
 */
export function dropSupersededLegacyTodos(lines: string[], fresh: ManagedTodo[]): string[] {
	const keep = new Set(fresh.map(t => encodeTodoId(t.id)));
	const urls = new Set<string>();
	for (const id of keep) {
		const m = ACTION_ID_RE.exec(id);
		if (m) urls.add(m[2]!);
	}
	if (urls.size === 0) return lines;
	let inside = false;
	return lines.filter(line => {
		if (START_RE.test(line)) { inside = true; return true; }
		if (END_RE.test(line)) { inside = false; return true; }
		if (inside || isChecked(line)) return true;
		const id = parseTodoId(line);
		const m = id === null ? null : ACTION_ID_RE.exec(id);
		return !(m && urls.has(m[2]!) && !keep.has(id!));
	});
}
