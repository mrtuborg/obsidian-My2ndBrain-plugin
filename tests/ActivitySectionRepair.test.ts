import { repairActivitiesSection } from '../src/components/ActivitySectionRepair';
import { ExternalWorkComposer } from '../src/composers/ExternalWorkComposer';
import { buildPathNormalizer } from '../src/utilities/ActivityLinks';

const U = 'https://sensio.ghe.com/roommate/fw/pull/12';
const V = 'https://sensio.ghe.com/roommate/fw/pull/13';
const norm = buildPathNormalizer([{ path: 'Activities/Foo.md' }, { path: 'Activities/Bar.md' }], 'Activities');
const todo = (c: boolean, t: string, id: string) => `- [${c ? 'x' : ' '}] ${t} <!-- 2ndbrain:todo:${id} -->`;
const count = (s: string, n: string) => s.split(n).length - 1;

const PLAN = ['<!-- 2ndbrain:plan:morning:2026-01-05:Engineer:start -->', 'plan text', '<!-- 2ndbrain:plan:morning:2026-01-05:Engineer:end -->'];
const NOTES = ['## Notes', '', '##### [[Foo|Foo]]', '- [ ] untouched in notes'];

const corrupt = [
	'# Engineer', '', ...PLAN, '', '## Activities', '', '----',
	'##### [[Activities/Foo.md|Foo]]',
	'<!-- 2ndbrain:managed:morning:start -->', 'summary',
	todo(false, 'Continue «Old»', `continue@${U}`),
	todo(false, 'Follow up «Old»', `follow-up@${U}`),
	todo(false, 'Resolve', `resolve-conflicts@${U}`),
	todo(false, 'Fix', `fix-ci@${U}`),
	todo(false, 'Merge', `merge@${U}`),
	'<!-- 2ndbrain:managed:morning:end -->',
	'same prose', '- [ ] same todo',
	'----',
	'', 'typed between', '',
	'##### [[Foo|Foo]]',
	todo(true, 'Resolve', `resolve-conflicts@${U}`),
	'same prose', '- [ ] same todo',
	'----',
	'##### [[Activities/Bar.md|Bar]]', todo(false, 'Review', `review@${V}`),
	'----', '', ...NOTES,
].join('\n');

describe('repairActivitiesSection', () => {
	const out = repairActivitiesSection(corrupt, norm);

	it('emits one canonical block per Activity', () => {
		expect(count(out, '##### [[Activities/Foo.md|Foo]]')).toBe(1);
		expect(out.split('\n').filter(l => /^##### \[\[Foo\|/.test(l))).toHaveLength(1); // only the one in Notes
		expect(count(out, '##### [[Activities/Bar.md|Bar]]')).toBe(1);
	});

	it('dedupes ids checked-wins and lets specific actions win', () => {
		expect(count(out, `resolve-conflicts@${U}`)).toBe(1);
		expect(out).toContain(`- [x] Resolve <!-- 2ndbrain:todo:resolve-conflicts@${U} -->`.replace('Resolve <', 'Resolve <'));
		expect(out).not.toContain(`continue@${U}`);
		expect(out).not.toContain(`follow-up@${U}`);
		expect(out).not.toContain(`merge@${U}`);
	});

	it('keeps both identical unmarked lines and the region', () => {
		expect(count(out, 'same prose')).toBe(2);
		expect(count(out, '- [ ] same todo')).toBe(2);
		expect(count(out, 'managed:morning:start')).toBe(1);
	});

	it('keeps blank lines and text typed between duplicate blocks in place', () => {
		expect(out).toContain('- [ ] same todo\n\ntyped between\n\nsame prose');
	});

	it('leaves plan region and Notes untouched', () => {
		expect(out.startsWith(corrupt.slice(0, corrupt.indexOf('## Activities')))).toBe(true);
		expect(out.endsWith(NOTES.join('\n'))).toBe(true);
	});

	it('is byte-identical on a second repair', () => {
		expect(repairActivitiesSection(out, norm)).toBe(out);
	});

	it('returns a page without Activities unchanged', () => {
		expect(repairActivitiesSection('# x\n', norm)).toBe('# x\n');
	});
});

describe('ensureContext self-heals', () => {
	it('repairs an existing Context page', async () => {
		const path = 'Journal/Contexts/2026-01-05-Engineer.md';
		const files = new Map<string, string>([[path, corrupt], ['Activities/Foo.md', ''], ['Activities/Bar.md', '']]);
		const f = (p: string) => ({ path: p, name: p.split('/').pop()!, basename: p.split('/').pop()!.replace(/\.md$/, '') });
		const vault = {
			getAbstractFileByPath: (p: string) => (files.has(p) || p === 'Journal' || p === 'Journal/Contexts' ? f(p) : null),
			read: async (x: { path: string }) => files.get(x.path) ?? '',
			modify: async (x: { path: string }, c: string) => { files.set(x.path, c); },
			create: async () => ({}), createFolder: async () => {},
			getFiles: () => [...files.keys()].map(f),
		};
		const c = new ExternalWorkComposer(
			{ journalFolder: 'Journal', activitiesFolder: 'Activities', archiveFolder: 'Activities/Archive' },
			{ dailyNotePathForDate: d => `Journal/${d}.md` }
		);
		const r = await c.ensureContext({ vault } as any, '2026-01-05', 'Engineer');
		expect(r.status).toBe('exists');
		expect(count(files.get(path)!, '##### [[Activities/Foo.md|Foo]]')).toBe(1);
		expect(count(files.get(path)!, `resolve-conflicts@${U}`)).toBe(1);
	});
});
