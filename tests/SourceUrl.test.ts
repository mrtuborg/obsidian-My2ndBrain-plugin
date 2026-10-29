import { canonicalizeSourceUrl, titleContainsSourceNumber } from '../src/utilities/SourceUrl';

describe('canonicalizeSourceUrl', () => {
	it('collapses PR sub-pages, query, fragment, case and trailing slash to one identity', () => {
		const urls = [
			'https://Sensio.GHE.com/Roommate/Fw/pull/12',
			'https://sensio.ghe.com/roommate/fw/pull/12/files?diff=split#r1',
			'https://sensio.ghe.com/roommate/fw/pull/12/commits/',
			'https://sensio.ghe.com/roommate/fw/pull/12/checks',
		];
		const canon = urls.map(u => canonicalizeSourceUrl(u)!.url);
		expect(new Set(canon).size).toBe(1);
		expect(canon[0]).toBe('https://sensio.ghe.com/roommate/fw/pull/12');
	});

	it('classifies GitHub issues and PRs and exposes repo qualifier and number', () => {
		const issue = canonicalizeSourceUrl('https://github.com/o/Repo/issues/7')!;
		expect(issue).toMatchObject({ kind: 'github-issue', qualifier: 'repo', number: '7', scope: 'o/repo' });
		expect(canonicalizeSourceUrl('https://github.com/o/r/pull/8')!.kind).toBe('github-pr');
	});

	it('maps the REST API form onto the html URL', () => {
		expect(canonicalizeSourceUrl('https://api.github.com/repos/o/r/pulls/5')!.url)
			.toBe('https://github.com/o/r/pull/5');
		expect(canonicalizeSourceUrl('https://api.github.com/repos/o/r/issues/5')!.url)
			.toBe('https://github.com/o/r/issues/5');
	});

	it('normalises both Azure DevOps hosts to dev.azure.com', () => {
		const a = canonicalizeSourceUrl('https://dev.azure.com/Sensio/RoomMate/_workitems/edit/42?x=1')!;
		const b = canonicalizeSourceUrl('https://sensio.visualstudio.com/RoomMate/_workitems/edit/42')!;
		expect(a.url).toBe('https://dev.azure.com/sensio/roommate/_workitems/edit/42');
		expect(b.url).toBe(a.url);
		expect(a.kind).toBe('azure-work-item');
		const pr = canonicalizeSourceUrl('https://dev.azure.com/sensio/RoomMate/_git/Platform/pullrequest/9')!;
		expect(pr).toMatchObject({ kind: 'azure-pr', number: '9', qualifier: 'platform' });
	});

	it('keeps other links by host+path and rejects non-http input', () => {
		expect(canonicalizeSourceUrl('https://www.Example.com/a/B/?q=1#f')!)
			.toMatchObject({ url: 'https://example.com/a/b', kind: 'other' });
		expect(canonicalizeSourceUrl('not a url')).toBeNull();
		expect(canonicalizeSourceUrl('ftp://x/y')).toBeNull();
	});
});

describe('titleContainsSourceNumber', () => {
	it.each([
		'Fix CI #123', 'PR 45 cleanup', 'AB#77 sync', 'Pull request 9', 'WI-12 thing', 'ABC-123 login',
	])('rejects %s', t => expect(titleContainsSourceNumber(t)).toBe(true));

	it('rejects the actual source number as a standalone token only', () => {
		expect(titleContainsSourceNumber('Gateway 42 rollout', ['42'])).toBe(true);
		expect(titleContainsSourceNumber('Gateway 420 rollout', ['42'])).toBe(false);
	});

	it.each(['Gateway firmware update', 'Thread border router', 'Wi-Fi provisioning'])(
		'accepts %s', t => expect(titleContainsSourceNumber(t)).toBe(false)
	);
});
