import { CanonicalSource, SourceKind, canonicalizeSourceUrl, titleContainsSourceNumber } from '../utilities/SourceUrl';
import {
	ManagedKind,
	ManagedTodo,
	MANAGED_KINDS,
	dedupeGeneratedTodos,
	dropSupersededLegacyTodos,
	extractRegion,
	mergeBlockBodies,
	mergeManagedTodos,
	normalizeActionSets,
	parseTodoId,
	reconcileRegions,
	refreshGeneratedText,
	replaceRegion,
	sanitizeLine,
	sanitizeSummaryLine,
} from './ManagedRegions';
import { PathNormalizer, spellingNormalizer } from '../utilities/ActivityLinks';

/**
 * Pure rules for upserting externally sourced work (GitHub / Azure DevOps)
 * into Activities and Context pages. No Obsidian API (D7), no network, no
 * LLM (decision 10): the caller — a skill — has already chosen the short
 * semantic title; everything here is deterministic.
 */

// ── Request model ────────────────────────────────────────────────────────

export const TODO_ACTIONS = {
	review: (t: string) => `Review in «${t}»`,
	'fix-ci': (t: string) => `Fix CI in «${t}»`,
	'address-feedback': (t: string) => `Address feedback in «${t}»`,
	continue: (t: string) => `Continue «${t}»`,
	'resolve-conflicts': (t: string) => `Resolve conflicts in «${t}»`,
	merge: (t: string) => `Merge «${t}»`,
	unblock: (t: string) => `Unblock «${t}»`,
	'follow-up': (t: string) => `Follow up on «${t}»`,
} as const;

/** Leading verb each action already starts a title with, so it is not said twice. */
const ACTION_VERB: Record<keyof typeof TODO_ACTIONS, RegExp> = {
	review: /^review\b/i,
	'fix-ci': /^fix\s+(?:the\s+)?(?:ci|checks?|build)\b/i,
	'address-feedback': /^address\b/i,
	continue: /^continue\b/i,
	'resolve-conflicts': /^(?:resolve|fix)\s+(?:merge\s+)?conflicts?\b/i,
	merge: /^merge\b/i,
	unblock: /^unblock\b/i,
	'follow-up': /^follow\s+up\b/i,
};
/** Any imperative lead-in; a title starting with one already reads as a todo. */
const ANY_VERB = /^(?:review|continue|merge|unblock|fix|resolve|address|follow\s+up|finish|update|implement|investigate)\b/i;

/**
 * Human wording of a generated todo. The Activity name is user-owned and may
 * already begin with the action ("Review parser", "Fix conflicts in X"); in that
 * case the name alone is the todo — never `Continue «Continue …»`.
 */
export function todoText(action: keyof typeof TODO_ACTIONS, title: string): string {
	if (ACTION_VERB[action].test(title)) return title;
	if (action === 'continue' && ANY_VERB.test(title)) return title;
	return TODO_ACTIONS[action](title);
}
export type TodoAction = keyof typeof TODO_ACTIONS | 'custom';

export interface SourceInput { url: string; title?: string }

export interface TodoInput {
	action: TodoAction;
	/** Which source the action belongs to; defaults to the first source. */
	sourceUrl?: string;
	/** `custom` only: the human-readable text and the stable key identifying it. */
	label?: string;
	key?: string;
}

export interface ExternalWorkRequest {
	/** The work date — picks the Context page, which may be in the past. */
	date: string;
	kind: ManagedKind;
	/** Defaults from `kind`: morning→Engineer, board→TechLead, evening→Engineer. */
	role?: string;
	activity: {
		/** Short semantic title chosen by the caller. Never contains a number. */
		title: string;
		/** Topic / product qualifier used only if `title` collides with another Activity. */
		qualifier?: string;
		sources: SourceInput[];
		/** Default true for morning/board, false for evening. */
		createIfMissing?: boolean;
		/** Birth value only; an existing Activity's flag is never touched. */
		takeToWork?: boolean;
	};
	summary?: string[];
	todos?: TodoInput[];
}

export type ResultStatus = 'created' | 'updated' | 'skipped' | 'conflict' | 'error';

export interface ExternalWorkResult {
	status: ResultStatus;
	code?: string;
	message?: string;
	activityPath?: string;
	contextPath?: string;
	createdActivity?: boolean;
	warnings: string[];
	conflicts?: SourceConflict[];
}

export interface SourceConflict { url: string; owners: string[] }

export interface ActivityIndexEntry {
	path: string;
	basename: string;
	sourceUrls: string[];
	archived: boolean;
	role: string;
	stage: string;
}

export type Validated =
	| { ok: true; request: ExternalWorkRequest; role: string; sources: Array<CanonicalSource & { title: string }>; todos: ManagedTodo[] }
	| { ok: false; code: string; message: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const ROLE_FOR_KIND: Record<ManagedKind, readonly string[]> = {
	morning: ['Engineer'],
	evening: ['Engineer', 'TechLead'],
	board: ['TechLead'],
};

export function defaultRoleForKind(kind: ManagedKind): string {
	return ROLE_FOR_KIND[kind][0]!;
}

function fail(code: string, message: string): Validated {
	return { ok: false, code, message };
}

export function validateRequest(req: ExternalWorkRequest, knownRoles: readonly string[]): Validated {
	if (!req || typeof req !== 'object') return fail('bad-request', 'Request must be an object.');
	if (!DATE_RE.test(req.date ?? '') || isNaN(Date.parse(req.date))) {
		return fail('bad-date', `Invalid date "${req.date}". Expected YYYY-MM-DD.`);
	}
	if (!(MANAGED_KINDS as readonly string[]).includes(req.kind)) {
		return fail('bad-kind', `Invalid kind "${req.kind}". Expected morning, evening or board.`);
	}
	const role = req.role ?? defaultRoleForKind(req.kind);
	if (!knownRoles.includes(role)) return fail('bad-role', `Unknown role "${role}".`);
	if (!ROLE_FOR_KIND[req.kind].includes(role)) {
		return fail(
			'role-kind-mismatch',
			`A ${req.kind} entry belongs in ${ROLE_FOR_KIND[req.kind].join(' or ')}, not ${role}.`
		);
	}

	const title = (req.activity?.title ?? '').trim();
	if (!title) return fail('title-empty', 'activity.title is required.');

	const rawSources = req.activity?.sources ?? [];
	if (rawSources.length === 0) return fail('no-sources', 'At least one source URL is required.');
	const sources: Array<CanonicalSource & { title: string }> = [];
	for (const s of rawSources) {
		const canon = canonicalizeSourceUrl(s?.url);
		if (!canon) return fail('bad-source-url', `Not an http(s) URL: ${String(s?.url)}`);
		if (sources.some(x => x.url === canon.url)) continue;
		sources.push({ ...canon, title: (s.title ?? '').trim() });
	}

	const numbers = sources.map(s => s.number);
	if (titleContainsSourceNumber(title, numbers)) {
		return fail('title-has-number', `Activity title "${title}" contains a PR/issue/work-item number. Use a semantic title.`);
	}
	const qualifier = (req.activity.qualifier ?? '').trim();
	if (qualifier && titleContainsSourceNumber(qualifier, numbers)) {
		return fail('qualifier-has-number', `Qualifier "${qualifier}" contains a number. Use a repo, product or topic name.`);
	}

	const summary = req.summary ?? [];
	const todoInputs = req.todos ?? [];
	if (summary.length === 0 && todoInputs.length === 0) {
		return fail('empty-request', 'Nothing to write: provide summary lines or todos.');
	}

	const todos: ManagedTodo[] = [];
	for (const t of todoInputs) {
		const built = buildTodo(t, sources);
		if ('error' in built) return fail(built.error.code, built.error.message);
		todos.push(built.todo);
	}
	return { ok: true, request: req, role, sources, todos };
}

/** Todo text depends on the Activity title, so it is finished later by `finishTodos`. */
function buildTodo(
	t: TodoInput,
	sources: Array<CanonicalSource & { title: string }>
): { todo: ManagedTodo } | { error: { code: string; message: string } } {
	if (t.action === 'custom') {
		const label = (t.label ?? '').trim();
		const key = (t.key ?? '').trim();
		if (!label || !key) {
			return { error: { code: 'bad-todo', message: 'A custom todo needs both label and key.' } };
		}
		if (titleContainsSourceNumber(label, [])) {
			return { error: { code: 'todo-has-number', message: `Todo "${label}" refers to an item by number.` } };
		}
		return { todo: { id: `custom:${key}`, text: label } };
	}
	if (!(t.action in TODO_ACTIONS)) {
		return { error: { code: 'bad-todo', message: `Unknown todo action "${t.action}".` } };
	}
	const canon = t.sourceUrl ? canonicalizeSourceUrl(t.sourceUrl) : sources[0]!;
	if (!canon || !sources.some(s => s.url === canon.url)) {
		return { error: { code: 'bad-todo', message: `Todo source ${t.sourceUrl} is not one of the activity's sources.` } };
	}
	// Text is a placeholder until the title is final (see finishTodos).
	return { todo: { id: `${t.action}@${canon.url}`, text: '' } };
}

/** Fills in the human-readable text of generated todos from the final Activity title. */
export function finishTodos(todos: ManagedTodo[], title: string): ManagedTodo[] {
	return todos.map(t => {
		if (t.text) return t;
		const action = t.id.slice(0, t.id.indexOf('@')) as keyof typeof TODO_ACTIONS;
		return { id: t.id, text: todoText(action, title) };
	});
}

// ── Identity lookup & conflicts ──────────────────────────────────────────

/** Distinct Activities owning any of `urls`. */
export function ownersOf(index: ActivityIndexEntry[], urls: string[]): ActivityIndexEntry[] {
	const want = new Set(urls);
	return index.filter(a => a.sourceUrls.some(u => want.has(u)));
}

/** Every URL claimed by more than one Activity. Reported, never resolved. */
export function findSourceConflicts(index: ActivityIndexEntry[], onlyUrls?: string[]): SourceConflict[] {
	const owners = new Map<string, Set<string>>();
	for (const a of index) {
		for (const u of a.sourceUrls) {
			if (onlyUrls && !onlyUrls.includes(u)) continue;
			if (!owners.has(u)) owners.set(u, new Set());
			owners.get(u)!.add(a.path);
		}
	}
	return [...owners.entries()]
		.filter(([, set]) => set.size > 1)
		.map(([url, set]) => ({ url, owners: [...set].sort() }));
}

// ── Naming ───────────────────────────────────────────────────────────────

export function sanitizeFileName(title: string): string {
	return title
		.replace(/[\\/:*?"<>|#^[\]]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^[.\s]+|[.\s]+$/g, '')
		.slice(0, 100)
		.trim();
}

export type NameResult =
	| { ok: true; name: string }
	| { ok: false; code: string; message: string };

/**
 * Picks the file basename for a NEW Activity. On a collision with any other
 * note the title is qualified semantically — the caller's qualifier first,
 * then the source's repo / project — never with a number. If every semantic
 * candidate also collides the caller is asked for a better qualifier.
 */
export function resolveActivityName(
	title: string,
	qualifier: string,
	sources: CanonicalSource[],
	nameExists: (name: string) => boolean
): NameResult {
	const base = sanitizeFileName(title);
	if (!base) return { ok: false, code: 'title-empty', message: 'Title is empty after sanitising.' };
	if (!nameExists(base)) return { ok: true, name: base };

	const numbers = sources.map(s => s.number);
	const candidates: string[] = [];
	for (const q of [qualifier, sources[0]?.qualifier ?? '']) {
		const clean = sanitizeFileName(q);
		if (!clean || titleContainsSourceNumber(clean, numbers)) continue;
		const name = sanitizeFileName(`${base} (${clean})`);
		if (!candidates.includes(name)) candidates.push(name);
	}
	for (const name of candidates) {
		if (!nameExists(name)) return { ok: true, name };
	}
	return {
		ok: false,
		code: 'name-collision',
		message: `"${base}" already names another note. Re-run with activity.qualifier set to a repo, product or topic that distinguishes it (never a number).`,
	};
}

// ── Activity file: source identity + managed source area ────────────────

export interface SourceEntry { url: string; title: string; meta: string }

const SRC_START = '<!-- 2ndbrain:sources:start -->';
const SRC_END = '<!-- 2ndbrain:sources:end -->';
const KIND_LABEL: Record<SourceKind, string> = {
	'github-issue': 'GitHub issue',
	'github-pr': 'GitHub PR',
	'azure-work-item': 'Azure DevOps work item',
	'azure-pr': 'Azure DevOps PR',
	other: 'Link',
};

export function sourceMeta(s: CanonicalSource): string {
	return [KIND_LABEL[s.kind], s.scope].filter(Boolean).join(' · ');
}

function frontmatterRange(lines: string[]): { end: number } | null {
	if (lines[0] !== '---') return null;
	for (let i = 1; i < lines.length; i++) if (lines[i] === '---') return { end: i };
	return null;
}

/** The canonical URLs an Activity owns — the `sourceUrls:` frontmatter list. */
export function parseSourceUrls(content: string): string[] {
	const lines = content.split('\n');
	const fm = frontmatterRange(lines);
	if (!fm) return [];
	const urls: string[] = [];
	for (let i = 1; i < fm.end; i++) {
		if (!/^sourceUrls:\s*$/.test(lines[i]!)) continue;
		for (let j = i + 1; j < fm.end && /^\s+- /.test(lines[j]!); j++) {
			urls.push(lines[j]!.replace(/^\s+- /, '').trim());
		}
		break;
	}
	return urls;
}

const ENTRY_RE = /^> - \[(.*)\]\(([^)\s]+)\)(?: · (.*))?$/;

export function parseSourceEntries(content: string): SourceEntry[] {
	const lines = content.split('\n');
	const s = lines.indexOf(SRC_START);
	const e = lines.indexOf(SRC_END);
	if (s === -1 || e === -1 || e < s) return [];
	const out: SourceEntry[] = [];
	for (const line of lines.slice(s + 1, e)) {
		const m = ENTRY_RE.exec(line);
		if (m) out.push({ title: m[1]!, url: m[2]!, meta: m[3] ?? '' });
	}
	return out;
}

function sanitizeTitle(title: string): string {
	return sanitizeLine(title).replace(/\[/g, '(').replace(/\]/g, ')').replace(/\s+/g, ' ').trim();
}

/**
 * Records sources on an Activity: identity in the `sourceUrls:` frontmatter
 * list, display in the managed source area. Upstream titles are refreshed;
 * sources not mentioned are kept. The Activity's own name is never involved.
 */
export function applySources(content: string, incoming: SourceEntry[]): string {
	const entries = new Map<string, SourceEntry>();
	for (const e of parseSourceEntries(content)) entries.set(e.url, e);
	for (const url of parseSourceUrls(content)) {
		if (!entries.has(url)) entries.set(url, { url, title: url, meta: '' });
	}
	for (const e of incoming) {
		const prev = entries.get(e.url);
		entries.set(e.url, {
			url: e.url,
			title: sanitizeTitle(e.title) || prev?.title || e.url,
			meta: e.meta || prev?.meta || '',
		});
	}
	const list = [...entries.values()];
	return writeSourceArea(writeSourceUrls(content, list.map(e => e.url)), list);
}

function writeSourceUrls(content: string, urls: string[]): string {
	const lines = content.split('\n');
	const fm = frontmatterRange(lines);
	const block = ['sourceUrls:', ...urls.map(u => `  - ${u}`)];
	if (!fm) return ['---', ...block, '---', '', content.trimStart()].join('\n');

	let start = -1;
	let stop = -1;
	for (let i = 1; i < fm.end; i++) {
		if (/^sourceUrls:/.test(lines[i]!)) {
			start = i;
			stop = i + 1;
			while (stop < fm.end && /^\s+- /.test(lines[stop]!)) stop++;
			break;
		}
	}
	if (start === -1) return [...lines.slice(0, fm.end), ...block, ...lines.slice(fm.end)].join('\n');
	return [...lines.slice(0, start), ...block, ...lines.slice(stop)].join('\n');
}

function writeSourceArea(content: string, entries: SourceEntry[]): string {
	const area = [
		SRC_START,
		'> [!info] Sources — managed by 2ndBrain, edits here are overwritten',
		...entries.map(e => `> - [${e.title}](${e.url})${e.meta ? ` · ${e.meta}` : ''}`),
		SRC_END,
	];
	const lines = content.split('\n');
	const s = lines.indexOf(SRC_START);
	const e = lines.indexOf(SRC_END);
	if (s !== -1 && e > s) return [...lines.slice(0, s), ...area, ...lines.slice(e + 1)].join('\n');

	const fm = frontmatterRange(lines);
	const bodyStart = fm ? fm.end + 1 : 0;
	let at = lines.findIndex((l, i) => i >= bodyStart && /^## Description\s*$/.test(l));
	if (at === -1) at = lines.findIndex((l, i) => i >= bodyStart && /^## Journal\s*$/.test(l));
	if (at === -1) {
		return [...lines.slice(0, bodyStart), '', ...area, '', ...lines.slice(bodyStart)].join('\n');
	}
	return [...lines.slice(0, at), ...area, '', ...lines.slice(at)].join('\n');
}

export interface NewActivity {
	date: string;
	role: string;
	takeToWork: boolean;
	sources: SourceEntry[];
}

/** A new Activity: same scaffold AutoActivityCreator writes, plus source identity. */
export function buildActivityContent(a: NewActivity): string {
	const base = [
		'---',
		`startDate: ${a.date}`,
		'stage: doing',
		`takeToWork: ${a.takeToWork ? 'true' : 'false'}`,
		'responsible: [Me]',
		'priority: not-urgent-important',
		'remind: weekdays',
		'project: inbox',
		`role: ${a.role}`,
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
	return applySources(base, a.sources);
}

// ── Context page ─────────────────────────────────────────────────────────

/**
 * The scaffold of a Context page. The "← Daily Note" backlink is only
 * written when that note exists: a link to a missing note would be turned
 * into a stray Activity stub by the next wikilink scan.
 */
export function contextPageTemplate(role: string, date: string, dailyNotePath: string | null): string {
	return [
		`# ${role} — ${date}`,
		'',
		...(dailyNotePath ? [`[[${dailyNotePath}|← Daily Note]]`, ''] : []),
		'## Activities',
		'',
		'## Notes',
		'',
	].join('\n');
}

const BLOCK_HEADING_RE = /^#####\s+\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/;

export interface BlockUpdate {
	activityPath: string;
	displayName: string;
	kind: ManagedKind;
	summary: string[];
	todos: ManagedTodo[];
	/**
	 * Lets a block orphaned by a rename (link target no longer exists, e.g.
	 * Obsidian link auto-update is off) be adopted rather than duplicated. It is
	 * adopted only when its managed todo ids name one of `sourceUrls`.
	 */
	targetExists?: (path: string) => boolean;
	/** Maps a heading's wikilink target to the Activity's canonical path (see ActivityLinks). */
	normalizePath?: PathNormalizer;
	sourceUrls?: string[];
}

/**
 * Writes one managed region into an Activity's block on a Context page,
 * creating the block if absent. Everything else in the page — other blocks,
 * the other region kinds, every line the user typed, `## Notes` — is kept
 * byte-for-byte.
 */
export function upsertActivityBlock(content: string, update: BlockUpdate): string {
	const lines = content.split('\n');
	let actStart = lines.findIndex(l => /^## Activities\s*$/.test(l));
	if (actStart === -1) {
		const notes = lines.findIndex(l => /^## Notes\s*$/.test(l));
		const at = notes === -1 ? lines.length : notes;
		lines.splice(at, 0, '## Activities', '', '');
		actStart = at;
	}
	let sectionEnd = lines.length;
	for (let i = actStart + 1; i < lines.length; i++) {
		if (/^## Notes\s*$/.test(lines[i]!)) { sectionEnd = i; break; }
	}

	const heading = `##### [[${update.activityPath}|${update.displayName}]]`;
	const norm = update.normalizePath ?? spellingNormalizer;
	const target = norm(update.activityPath).toLowerCase();

	// Every block naming this Activity, however Obsidian spelled the link.
	const heads: number[] = [];
	for (let i = actStart + 1; i < sectionEnd; i++) {
		const m = BLOCK_HEADING_RE.exec(lines[i]!);
		if (m && norm(m[1]!).toLowerCase() === target) heads.push(i);
	}

	if (heads.length === 0 && update.targetExists && update.sourceUrls?.length) {
		for (let i = actStart + 1; i < sectionEnd && heads.length === 0; i++) {
			const m = BLOCK_HEADING_RE.exec(lines[i]!);
			if (!m || update.targetExists(m[1]!.trim())) continue;
			for (let j = i + 1; j < sectionEnd && lines[j]!.trim() !== '----'; j++) {
				const id = parseTodoId(lines[j]!);
				if (id && update.sourceUrls.some(u => id.includes(u))) { heads.push(i); break; }
			}
		}
	}

	const regionBody = (existing: string[]): string[] => [
		...update.summary.map(sanitizeSummaryLine),
		...mergeManagedTodos(existing, update.todos),
	];

	if (heads.length === 0) {
		const region = replaceRegion([], update.kind, regionBody([]));
		let last = sectionEnd - 1;
		while (last > actStart && lines[last]!.trim() === '') last--;
		const needsOpen = last === actStart;
		const needsClose = !needsOpen && lines[last]!.trim() !== '----';
		const insert = [
			...(needsOpen || needsClose ? ['----'] : []),
			heading,
			...region,
			'----',
		];
		lines.splice(last + 1, 0, ...insert);
		return lines.join('\n');
	}

	const extents = heads.map(h => {
		let end = h + 1;
		while (end < sectionEnd && lines[end]!.trim() !== '----') end++;
		return { head: h, end };
	});
	const bodies = extents.map(x => lines.slice(x.head + 1, x.end));
	const first = extents[0]!;
	const merged = bodies.length > 1 ? mergeBlockBodies(bodies) : reconcileRegions(bodies[0]!);

	// Generated todos are plugin-owned: the marker is identity, so copies outside
	// the region fold into it, superseded legacy lines go, and wording follows
	// the Activity's current name.
	const withRegion = replaceRegion(
		dropSupersededLegacyTodos(merged, update.todos),
		update.kind,
		regionBody(extractRegion(merged, update.kind) ?? [])
	);
	const newBody = normalizeActionSets(
		dedupeGeneratedTodos(refreshGeneratedText(withRegion, update.todos))
	);
	const closing = first.end < sectionEnd ? [] : ['----'];
	for (let k = extents.length - 1; k > 0; k--) {
		const x = extents[k]!;
		lines.splice(x.head, x.end - x.head + (x.end < sectionEnd ? 1 : 0));
	}
	lines.splice(first.head, first.end - first.head, heading, ...newBody, ...closing);
	return lines.join('\n');
}
