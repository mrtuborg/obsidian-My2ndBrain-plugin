import { canonicalizeSourceUrl } from '../utilities/SourceUrl';
import {
	ActivityIndexEntry,
	ROLE_FOR_KIND,
	SourceConflict,
	defaultRoleForKind,
} from './ExternalWork';
import { MANAGED_KINDS, ManagedKind, sanitizeSummaryLine } from './ManagedRegions';

/**
 * The plan overview: the one place on a Context page that is *read*, as
 * opposed to the Activity blocks below it, which are where the user writes.
 * Pure — no Obsidian API (D7), no network, no LLM. The caller has already
 * decided what belongs in the plan and phrased each sentence; this module
 * only resolves Activities by canonical URL, orders, caps and renders.
 *
 * It lives in its own region
 *
 *     <!-- 2ndbrain:plan:<kind>:<date>:<role>:start -->
 *     ...
 *     <!-- 2ndbrain:plan:<kind>:<date>:<role>:end -->
 *
 * directly above `## Activities`, so the Activity-block regions
 * (`2ndbrain:managed:*`) can never replace it and it can never replace them.
 */

export const PLAN_SECTIONS = ['reviews', 'finish', 'continue', 'pull-next', 'blockers'] as const;
export type PlanSection = typeof PLAN_SECTIONS[number];

export const SECTION_TITLES: Record<PlanSection, string> = {
	reviews: 'Reviews waiting',
	finish: 'Finish',
	continue: 'Continue',
	'pull-next': 'Pull next',
	blockers: 'Actionable blockers',
};

const KIND_TITLES: Record<ManagedKind, string> = {
	morning: 'Workday plan',
	evening: 'Evening review',
	board: 'Board plan',
};

export const DEFAULT_MAX_ITEMS = 12;
export const HARD_MAX_ITEMS = 30;
const SENTENCE_LIMIT = 280;
const FAILURE_LIMIT = 10;

export interface PlanItemInput {
	section: PlanSection;
	/** Any source URL of the Activity; resolved to the user-owned Activity by identity. */
	url: string;
	/** One concise human sentence, evidence-backed. No wikilinks, no numbers-as-names. */
	sentence: string;
}

export interface WorkdayPlanRequest {
	date: string;
	kind: ManagedKind;
	role?: string;
	/** Already ordered by the caller within a section; sections are ordered here. */
	items: PlanItemInput[];
	/** Items the caller left out before sending (cap, noise); shown as a count. */
	omitted?: number;
	/** Sources that failed or were partial, so a thin plan is never read as a quiet day. */
	sourceFailures?: string[];
	maxItems?: number;
}

export interface PlanIssue { url: string; code: string; message: string }

export interface WorkdayPlanResult {
	status: 'updated' | 'unchanged' | 'error';
	code?: string;
	message?: string;
	contextPath?: string;
	placed: number;
	omitted: number;
	/** Items skipped without a link: no Activity, archived, done, duplicate. */
	unresolved: PlanIssue[];
	conflicts: SourceConflict[];
	warnings: string[];
}

export interface PlanLine { section: PlanSection; path: string; name: string; sentence: string }

export type ValidatedPlan =
	| {
		ok: true;
		role: string;
		items: Array<PlanItemInput & { url: string }>;
		omitted: number;
		failures: string[];
		maxItems: number;
	}
	| { ok: false; code: string; message: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(code: string, message: string): ValidatedPlan {
	return { ok: false, code, message };
}

export function validatePlanRequest(req: WorkdayPlanRequest, knownRoles: readonly string[]): ValidatedPlan {
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
		return fail('role-kind-mismatch', `A ${req.kind} plan belongs in ${ROLE_FOR_KIND[req.kind].join(' or ')}, not ${role}.`);
	}
	if (!Array.isArray(req.items)) return fail('bad-items', 'items must be an array.');

	const items: Array<PlanItemInput & { url: string }> = [];
	for (const it of req.items) {
		if (!it || !(PLAN_SECTIONS as readonly string[]).includes(it.section)) {
			return fail('bad-section', `Unknown plan section "${String(it?.section)}".`);
		}
		const canon = canonicalizeSourceUrl(it.url);
		if (!canon) return fail('bad-source-url', `Not an http(s) URL: ${String(it.url)}`);
		const sentence = cleanSentence(it.sentence);
		if (!sentence) return fail('sentence-empty', `Item ${canon.url} needs a sentence.`);
		items.push({ section: it.section, url: canon.url, sentence });
	}

	const omitted = req.omitted ?? 0;
	if (!Number.isInteger(omitted) || omitted < 0) return fail('bad-omitted', 'omitted must be a non-negative integer.');
	const failures = (req.sourceFailures ?? []).map(cleanSentence).filter(Boolean).slice(0, FAILURE_LIMIT);
	const maxItems = Math.min(HARD_MAX_ITEMS, Math.max(1, Math.floor(req.maxItems ?? DEFAULT_MAX_ITEMS)));
	return { ok: true, role, items, omitted, failures, maxItems };
}

function cleanSentence(text: unknown): string {
	const raw = typeof text === 'string' ? text : '';
	const line = sanitizeSummaryLine(raw).replace(/\s+/g, ' ').trim();
	return line.length > SENTENCE_LIMIT ? `${line.slice(0, SENTENCE_LIMIT - 1).trimEnd()}…` : line;
}

export interface ResolvedPlan {
	lines: PlanLine[];
	unresolved: PlanIssue[];
	conflicts: SourceConflict[];
	/** Items beyond `maxItems`, in priority order. */
	truncated: number;
}

/**
 * Finds the user-owned Activity of every item by canonical URL. Renames never
 * matter; a URL owned twice is reported and skipped, never guessed. The first
 * item per Activity wins, after ordering by section, so an Activity appears
 * once, under the most pressing heading.
 */
export function resolvePlan(
	items: Array<PlanItemInput & { url: string }>,
	index: ActivityIndexEntry[],
	maxItems: number
): ResolvedPlan {
	const ordered = PLAN_SECTIONS.flatMap(s => items.filter(i => i.section === s));
	const unresolved: PlanIssue[] = [];
	const conflicts: SourceConflict[] = [];
	const lines: PlanLine[] = [];
	const used = new Set<string>();

	for (const it of ordered) {
		const owners = index.filter(a => a.sourceUrls.includes(it.url));
		if (owners.length === 0) {
			unresolved.push({ url: it.url, code: 'no-activity', message: 'No Activity owns this URL; publish it as external work first.' });
			continue;
		}
		if (owners.length > 1) {
			if (!conflicts.some(c => c.url === it.url)) conflicts.push({ url: it.url, owners: owners.map(o => o.path).sort() });
			continue;
		}
		const owner = owners[0]!;
		if (owner.archived) {
			unresolved.push({ url: it.url, code: 'archived-activity', message: `${owner.path} is archived.` });
			continue;
		}
		if (owner.stage === 'done') {
			unresolved.push({ url: it.url, code: 'activity-done', message: `${owner.path} is done.` });
			continue;
		}
		if (used.has(owner.path)) {
			unresolved.push({ url: it.url, code: 'duplicate-activity', message: `${owner.path} is already in the plan.` });
			continue;
		}
		used.add(owner.path);
		lines.push({ section: it.section, path: owner.path, name: owner.basename, sentence: it.sentence });
	}

	const truncated = Math.max(0, lines.length - maxItems);
	return { lines: lines.slice(0, maxItems), unresolved, conflicts, truncated };
}

// ── Region ───────────────────────────────────────────────────────────────

export function planStart(kind: ManagedKind, date: string, role: string): string {
	return `<!-- 2ndbrain:plan:${kind}:${date}:${role}:start -->`;
}

export function planEnd(kind: ManagedKind, date: string, role: string): string {
	return `<!-- 2ndbrain:plan:${kind}:${date}:${role}:end -->`;
}

function linkName(name: string): string {
	return name.replace(/[\]|[]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function renderPlanRegion(
	kind: ManagedKind,
	date: string,
	role: string,
	lines: PlanLine[],
	omitted: number,
	failures: string[]
): string[] {
	const out = [planStart(kind, date, role), `## ${KIND_TITLES[kind]}`, ''];
	if (lines.length === 0) out.push('Nothing actionable was placed in this plan.', '');
	for (const section of PLAN_SECTIONS) {
		const mine = lines.filter(l => l.section === section);
		if (mine.length === 0) continue;
		out.push(`### ${SECTION_TITLES[section]}`, '');
		for (const l of mine) out.push(`- [[${l.path}|${linkName(l.name)}]] — ${l.sentence}`);
		out.push('');
	}
	if (omitted > 0) out.push(`_${omitted} more ${omitted === 1 ? 'item was' : 'items were'} left out of this overview._`, '');
	for (const f of failures) out.push(`_Source gap: ${f}_`, '');
	out.push(planEnd(kind, date, role));
	return out;
}

type Range = { start: number; end: number };

function findPlanRegion(lines: string[], kind: ManagedKind, date: string, role: string): Range | 'corrupt' | null {
	const start = lines.findIndex(l => l.trim() === planStart(kind, date, role));
	if (start === -1) return null;
	const end = lines.findIndex((l, i) => i > start && l.trim() === planEnd(kind, date, role));
	return end === -1 ? 'corrupt' : { start, end };
}

/**
 * Replaces this kind/date/role's plan region, or inserts it directly above
 * `## Activities` (else above `## Notes`, else at the end). Everything outside
 * the region — other plan kinds, Activity blocks and their regions, `## Notes`
 * — is kept byte-for-byte. Returns null when the region's markers are damaged,
 * so the caller reports it instead of guessing what to overwrite.
 */
export function upsertPlanRegion(content: string, kind: ManagedKind, date: string, role: string, region: string[]): string | null {
	const lines = content.split('\n');
	const found = findPlanRegion(lines, kind, date, role);
	if (found === 'corrupt') return null;
	if (found) {
		lines.splice(found.start, found.end - found.start + 1, ...region);
		return lines.join('\n');
	}

	let at = lines.findIndex(l => /^## Activities\s*$/.test(l));
	if (at === -1) at = lines.findIndex(l => /^## Notes\s*$/.test(l));
	if (at === -1) {
		const tail = lines.length > 0 && lines[lines.length - 1]!.trim() === '' ? [] : [''];
		return [...lines, ...tail, ...region, ''].join('\n');
	}
	const lead = at > 0 && lines[at - 1]!.trim() !== '' ? [''] : [];
	lines.splice(at, 0, ...lead, ...region, '');
	return lines.join('\n');
}
