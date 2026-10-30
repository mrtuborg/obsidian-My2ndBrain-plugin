import { ActivitiesInProgress } from '../src/components/ActivitiesInProgress';
import { upsertActivityBlock } from '../src/components/ExternalWork';
import {
	dedupeGeneratedTodos,
	normalizeActionSets,
	parseTodoId,
	reconcileRegions,
} from '../src/components/ManagedRegions';
import { buildPathNormalizer } from '../src/utilities/ActivityLinks';
import { stripActivityBlocks } from '../src/utilities/DailyNoteSection';

const URL1 = 'https://sensio.ghe.com/roommate/fw/pull/12';
const ACT = 'Activities/New name.md';
const files = [{ path: ACT }, { path: 'Work/Acts/Deep.md' }];
const norm = buildPathNormalizer(files, 'Activities');

const count = (text: string, needle: string) => text.split(needle).length - 1;
const todo = (checked: boolean, text: string, id: string) =>
	`- [${checked ? 'x' : ' '}] ${text} <!-- 2ndbrain:todo:${id} -->`;

function page(...blocks: string[][]): string {
	return ['## Activities', '', '----', ...blocks.flatMap(b => [...b, '----']), '', '## Notes', ''].join('\n');
}

function upsert(content: string, over: Partial<Parameters<typeof upsertActivityBlock>[1]> = {}) {
	return upsertActivityBlock(content, {
		activityPath: ACT,
		displayName: 'New name',
		kind: 'morning',
		summary: [],
		todos: [{ id: `review@${URL1}`, text: 'Review in «New name»' }],
		sourceUrls: [URL1],
		normalizePath: norm,
		...over,
	});
}

describe('ActivityLinks normalizer', () => {
	it.each(['Activities/New name.md', 'Activities/New name', 'New name.md', 'New name', 'new NAME'])(
		'%s resolves to the canonical path', t => expect(norm(t)).toBe(ACT)
	);

	it('honours a configured nested folder', () => {
		const n = buildPathNormalizer(files, 'Work/Acts');
		expect(n('Deep')).toBe('Work/Acts/Deep.md');
		expect(n('Work/Acts/Deep')).toBe('Work/Acts/Deep.md');
		expect(n('New name')).toBe('New name.md');
	});
});

describe('upsertActivityBlock after a rename', () => {
	const short = ['##### [[New name|New name]]', '- [ ] my own note', 'prose line', todo(false, 'Review in «Old name»', `review@${URL1}`)];
	const canon = ['##### [[Activities/New name.md|New name]]', todo(true, 'Review in «Old name»', `review@${URL1}`), '- [ ] second own todo'];

	it('merges a short-link block and a canonical block into exactly one', () => {
		const out = upsert(page(short, canon));
		expect(count(out, '##### [[')).toBe(1);
		expect(out).toContain('##### [[Activities/New name.md|New name]]');
		expect(count(out, `2ndbrain:todo:review@${URL1}`)).toBe(1);
		expect(out).toContain('- [x] Review in «New name»');
		expect(out).toContain('- [ ] my own note');
		expect(out).toContain('prose line');
		expect(out).toContain('- [ ] second own todo');
		expect(out).not.toContain('Old name');
	});

	it('preserves identical unmarked prose and todos from duplicate blocks', () => {
		const mk = (h: string, c: boolean) => [h, 'same prose', `- [${c ? 'x' : ' '}] same todo`];
		const out = upsert(page(mk('##### [[New name|New name]]', false), mk('##### [[Activities/New name.md|New name]]', true)));
		expect(count(out, 'same prose')).toBe(2);
		expect(out).toContain('- [ ] same todo');
		expect(out).toContain('- [x] same todo');
		expect(count(out, 'same todo')).toBe(2);
	});

	it('is idempotent', () => {
		const once = upsert(page(short, canon));
		expect(upsert(once)).toBe(once);
	});

	it('keeps the checked copy of a duplicated marker', () => {
		const a = ['##### [[Activities/New name.md|New name]]', todo(false, 'x', `review@${URL1}`)];
		const b = ['##### [[Activities/New name.md|New name]]', todo(true, 'x', `review@${URL1}`)];
		const out = upsert(page(a, b));
		expect(count(out, 'todo:review@')).toBe(1);
		expect(out).toMatch(/- \[x\] Review in «New name»/);
	});

	it('refreshes old wording in another kind\'s region for the same marker', () => {
		const stale = [
			'##### [[Activities/New name.md|New name]]',
			'<!-- 2ndbrain:managed:evening:start -->',
			todo(false, 'Review in «Old name»', `review@${URL1}`),
			'<!-- 2ndbrain:managed:evening:end -->',
		];
		const out = upsert(page(stale));
		expect(out).not.toContain('Old name');
		expect(count(out, 'Review in «New name»')).toBe(2);
	});

	it('removes superseded unchecked legacy todos outside regions but keeps checked and custom ones', () => {
		const legacy = [
			'##### [[Activities/New name.md|New name]]',
			todo(false, 'Old continue', `continue@${URL1}`),
			todo(true, 'Done follow-up', `follow-up@${URL1}`),
			todo(false, 'custom thing', 'custom:abc'),
			'- [ ] hand-written',
		];
		const out = upsert(page(legacy));
		expect(out).not.toContain('Old continue');
		expect(out).toContain('Done follow-up');
		expect(out).toContain('custom thing');
		expect(out).toContain('- [ ] hand-written');
	});

	it('does not touch other Activities\' blocks', () => {
		const other = ['##### [[Activities/Other.md|Other]]', '- [ ] untouched'];
		const out = upsert(page(other, short));
		expect(out).toContain('- [ ] untouched');
		expect(count(out, '##### [[')).toBe(2);
	});
});

describe('reconcileRegions', () => {
	const S = (k: string) => `<!-- 2ndbrain:managed:${k}:start -->`;
	const E = (k: string) => `<!-- 2ndbrain:managed:${k}:end -->`;

	it('leaves a clean body untouched', () => {
		const body = [S('morning'), 'a', E('morning'), 'user'];
		expect(reconcileRegions(body)).toBe(body);
	});

	it('folds duplicate regions of one kind into one, keeping user lines', () => {
		const out = reconcileRegions([
			S('morning'), 'summary', todo(false, 't', 'review@u'), E('morning'),
			'user prose',
			S('morning'), 'summary', todo(true, 't', 'review@u'), 'extra', E('morning'),
		]);
		expect(out.filter(l => l === S('morning'))).toHaveLength(1);
		expect(out.filter(l => l === E('morning'))).toHaveLength(1);
		expect(out.filter(l => parseTodoId(l) !== null)).toEqual([todo(true, 't', 'review@u')]);
		expect(out).toEqual(expect.arrayContaining(['summary', 'extra', 'user prose']));
	});

	it('repairs nested and stray markers', () => {
		const out = reconcileRegions([S('board'), 'x', S('board'), 'y', E('board'), E('board'), E('evening')]);
		expect(out).toEqual([S('board'), 'x', 'y', E('board')]);
	});
});

describe('normalizeActionSets', () => {
	const ids = (lines: string[]) => lines.map(parseTodoId);
	const L = (a: string, checked = false) => todo(checked, a, `${a}@U`);

	it('lets a specific action suppress generic ones', () => {
		expect(ids(normalizeActionSets([L('continue'), L('follow-up'), L('review')]))).toEqual(['review@U']);
	});

	it('suppresses merge while a blocker is open, and again once it is gone', () => {
		expect(ids(normalizeActionSets([L('merge'), L('fix-ci')]))).toEqual(['fix-ci@U']);
		expect(ids(normalizeActionSets([L('merge'), L('fix-ci', true)]))).toEqual(['merge@U', 'fix-ci@U']);
	});

	it('keeps independent blockers, custom and unmarked todos, and other URLs', () => {
		const lines = [L('fix-ci'), L('address-feedback'), L('resolve-conflicts'), '- [ ] mine', todo(false, 'c', 'custom:k'), todo(false, 'g', 'continue@V')];
		expect(normalizeActionSets(lines)).toEqual(lines);
	});

	it('applies through upsert: continue + follow-up + resolve-conflicts collapse', () => {
		const existing = ['##### [[Activities/New name.md|New name]]', todo(false, 'c', `continue@${URL1}`), todo(false, 'f', `follow-up@${URL1}`)];
		const out = upsert(page(existing), {
			todos: [{ id: `resolve-conflicts@${URL1}`, text: 'Resolve conflicts in «New name»' }],
		});
		expect(count(out, '2ndbrain:todo:')).toBe(1);
		expect(out).toContain(`resolve-conflicts@${URL1}`);
	});
});

describe('Context rebuild with a short-link block', () => {
	function app(content: string) {
		const f = { path: ACT, basename: 'New name', name: 'New name.md', extension: 'md' };
		return {
			vault: {
				getFiles: () => [f],
				getAbstractFileByPath: (p: string) => (p === ACT ? f : null),
				read: async () => content,
			},
		} as any;
	}
	const activity = ['---', 'startDate: 2026-01-01', 'stage: doing', 'takeToWork: true', 'role: Engineer', '---', '', '## Journal', '', '----'].join('\n');

	it('renders one canonical block, preserving user lines and deduping markers', async () => {
		const existing = page(
			['##### [[New name|New name]]', 'user prose', todo(false, 'Review in «Old name»', `review@${URL1}`)],
			['##### [[Activities/New name.md|New name]]', todo(true, 'Review in «Old name»', `review@${URL1}`), '- [ ] mine'],
		);
		const out = await new ActivitiesInProgress().runForRole(app(activity), 'Engineer', existing);
		expect(count(out, '##### [[')).toBe(1);
		expect(out).toContain('##### [[Activities/New name.md|New name]]');
		expect(count(out, 'todo:review@')).toBe(1);
		expect(out).toContain('- [x] Review in «Old name»');
		expect(out).toContain('user prose');
		expect(out).toContain('- [ ] mine');
		expect(await new ActivitiesInProgress().runForRole(app(activity), 'Engineer', out)).toBe(out);
	});

	it('strips short-link originals from a daily note once absorbed', () => {
		const note = page(['##### [[New name|New name]]', 'x']);
		const stripped = stripActivityBlocks(note, [ACT], norm);
		expect(stripped).not.toContain('##### [[');
	});
});

describe('dedupeGeneratedTodos still holds', () => {
	it('collapses exact duplicates', () => {
		const l = todo(false, 'a', 'review@u');
		expect(dedupeGeneratedTodos([l, l])).toEqual([l]);
	});
});
