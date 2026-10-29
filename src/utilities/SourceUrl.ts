/**
 * Canonical identity of an external work source (GitHub issue/PR, Azure
 * DevOps work item/PR, or any other link). Pure — no Obsidian API (D7).
 *
 * The canonical URL is the *machine* identity of a source: an Activity owns
 * it, and every later run finds the Activity by it, regardless of what the
 * user renamed the Activity to or how the upstream title changed since.
 */

export type SourceKind =
	| 'github-issue'
	| 'github-pr'
	| 'azure-work-item'
	| 'azure-pr'
	| 'other';

export interface CanonicalSource {
	/** The identity: scheme + host + path, normalised. Safe to compare with ===. */
	url: string;
	kind: SourceKind;
	/** `owner/repo` (GitHub) or `org/project` (Azure); '' when unknown. */
	scope: string;
	/** The repository / product name used to qualify a colliding title; '' when unknown. */
	qualifier: string;
	/** The issue / PR / work-item number as text; '' for `other`. */
	number: string;
}

const AZURE_HOST_RE = /^([a-z0-9-]+)\.visualstudio\.com$/;

function cleanPath(path: string): string[] {
	return path.split('/').filter(Boolean);
}

function normaliseSegment(segment: string): string {
	let decoded = segment;
	try { decoded = decodeURIComponent(segment); } catch { /* keep raw */ }
	return encodeURIComponent(decoded.toLowerCase());
}

/**
 * Returns the canonical source for a URL, or null when `raw` is not an
 * http(s) URL. Query strings and fragments never take part in identity,
 * and sub-pages of a PR (`/files`, `/commits`, `/checks`) collapse to the PR.
 */
export function canonicalizeSourceUrl(raw: string): CanonicalSource | null {
	if (typeof raw !== 'string') return null;
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

	const host = url.hostname.toLowerCase().replace(/^www\./, '');
	const segments = cleanPath(url.pathname);

	// GitHub REST API form: /repos/o/r/(issues|pulls)/N
	if (host.startsWith('api.') && segments[0] === 'repos' && segments.length >= 5) {
		const apiHost = host.slice(4);
		const [, owner, repo, kind, num] = segments;
		if (/^\d+$/.test(num ?? '') && (kind === 'issues' || kind === 'pulls')) {
			return github(apiHost, owner!, repo!, kind === 'pulls' ? 'pull' : 'issues', num!);
		}
	}

	// GitHub / GitHub Enterprise: /owner/repo/(issues|pull)/N[/...]
	if (segments.length >= 4 && /^\d+$/.test(segments[3] ?? '') &&
		(segments[2] === 'issues' || segments[2] === 'pull')) {
		return github(host, segments[0]!, segments[1]!, segments[2], segments[3]!);
	}

	// Azure DevOps work item: /org/project/_workitems/edit/N
	const azure = azureParts(host, segments);
	if (azure) return azure;

	// Anything else: identity is host + path, without query or fragment.
	const path = segments.map(s => s.toLowerCase()).join('/');
	return {
		url: `https://${host}${path ? '/' + path : ''}`,
		kind: 'other',
		scope: '',
		qualifier: '',
		number: '',
	};
}

function github(host: string, owner: string, repo: string, type: string, num: string): CanonicalSource {
	const o = owner.toLowerCase();
	const r = repo.toLowerCase();
	return {
		url: `https://${host}/${o}/${r}/${type}/${num}`,
		kind: type === 'pull' ? 'github-pr' : 'github-issue',
		scope: `${o}/${r}`,
		qualifier: r,
		number: num,
	};
}

function azureParts(host: string, segments: string[]): CanonicalSource | null {
	let org: string | null = null;
	let rest = segments;
	let canonicalHost = host;

	if (host === 'dev.azure.com') {
		org = segments[0] ?? null;
		rest = segments.slice(1);
	} else {
		const m = AZURE_HOST_RE.exec(host);
		if (m) {
			org = m[1]!;
			canonicalHost = 'dev.azure.com';
		}
	}
	if (!org || rest.length < 3) return null;

	const project = normaliseSegment(rest[0]!);
	const o = org.toLowerCase();

	// <project>/_workitems/edit/N
	if (rest[1] === '_workitems' && rest[2] === 'edit' && /^\d+$/.test(rest[3] ?? '')) {
		return {
			url: `https://${canonicalHost}/${o}/${project}/_workitems/edit/${rest[3]}`,
			kind: 'azure-work-item',
			scope: `${o}/${project}`,
			qualifier: decodeURIComponent(project),
			number: rest[3]!,
		};
	}
	// <project>/_git/<repo>/pullrequest/N
	if (rest[1] === '_git' && rest[3] === 'pullrequest' && /^\d+$/.test(rest[4] ?? '')) {
		const repo = normaliseSegment(rest[2]!);
		return {
			url: `https://${canonicalHost}/${o}/${project}/_git/${repo}/pullrequest/${rest[4]}`,
			kind: 'azure-pr',
			scope: `${o}/${project}`,
			qualifier: decodeURIComponent(repo),
			number: rest[4]!,
		};
	}
	return null;
}

/**
 * Whether `title` carries a PR / issue / work-item number. Human-readable
 * Activity names must not — the URL is the identity, a number in a name is
 * noise that rots when the work is renamed or split.
 */
export function titleContainsSourceNumber(title: string, sourceNumbers: string[] = []): boolean {
	if (/(^|[^\w])#\d+/.test(title)) return true;
	if (/\bAB#?\d+/i.test(title)) return true;
	if (/\b(pr|pull request|pull|issue|bug|work ?item|wi|task|ticket)[\s#:_-]*\d+\b/i.test(title)) return true;
	if (/\b[A-Z][A-Z0-9]+-\d+\b/.test(title)) return true;
	for (const n of sourceNumbers) {
		if (n && new RegExp(`(^|[^\\d])${n}([^\\d]|$)`).test(title)) return true;
	}
	return false;
}
