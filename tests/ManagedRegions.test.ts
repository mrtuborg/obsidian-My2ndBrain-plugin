import {
	extractRegion,
	mergeManagedTodos,
	parseTodoId,
	renderManagedTodo,
	replaceRegion,
	sanitizeLine,
} from '../src/components/ManagedRegions';
import { NoteBlocksParser } from '../src/components/NoteBlocksParser';

describe('replaceRegion', () => {
	const user = ['- [ ] my own todo', 'a note I typed'];

	it('inserts a new region above user content', () => {
		const out = replaceRegion(user, 'morning', ['snap']);
		expect(out).toEqual([
			'<!-- 2ndbrain:managed:morning:start -->', 'snap', '<!-- 2ndbrain:managed:morning:end -->',
			...user,
		]);
	});

	it('replaces one kind without touching the other kind or user lines', () => {
		let body = replaceRegion(user, 'morning', ['m1']);
		body = replaceRegion(body, 'evening', ['e1']);
		body = replaceRegion(body, 'morning', ['m2']);
		expect(extractRegion(body, 'morning')).toEqual(['m2']);
		expect(extractRegion(body, 'evening')).toEqual(['e1']);
		expect(body.slice(-2)).toEqual(user);
		body = replaceRegion(body, 'evening', ['e2']);
		expect(extractRegion(body, 'morning')).toEqual(['m2']);
		expect(extractRegion(body, 'evening')).toEqual(['e2']);
	});

	it('orders morning before evening before board', () => {
		let body = replaceRegion([], 'board', ['b']);
		body = replaceRegion(body, 'morning', ['m']);
		body = replaceRegion(body, 'evening', ['e']);
		const starts = body.filter(l => l.includes(':start'));
		expect(starts.map(s => /managed:(\w+):/.exec(s)![1])).toEqual(['morning', 'evening', 'board']);
	});
});

describe('managed todos', () => {
	const todo = { id: 'review@https://github.com/o/r/pull/1', text: 'Review in «Gateway»' };

	it('round-trips identity and neutralises comment delimiters', () => {
		const line = renderManagedTodo({ id: 'custom:a--b', text: 'x' }, false);
		expect(parseTodoId(line)).toBe('custom:a-%2Db');
		expect(sanitizeLine('a --> b <!-- c [[Link]]')).not.toMatch(/-->|<!--|\[\[/);
	});

	it('keeps the checkbox state when the wording changes (rename)', () => {
		const first = mergeManagedTodos([], [todo]);
		const ticked = first.map(l => l.replace('- [ ]', '- [x]'));
		const renamed = mergeManagedTodos(ticked, [{ ...todo, text: 'Review in «Edge gateway»' }]);
		expect(renamed).toHaveLength(1);
		expect(renamed[0]).toMatch(/^- \[x\] Review in «Edge gateway»/);
	});

	it('does not duplicate on rerun', () => {
		const a = mergeManagedTodos([], [todo]);
		expect(mergeManagedTodos(a, [todo])).toEqual(a);
	});

	it('keeps ticked orphans, drops unticked ones', () => {
		const other = { id: 'fix-ci@https://github.com/o/r/pull/1', text: 'Fix CI in «Gateway»' };
		const existing = [renderManagedTodo(todo, true), renderManagedTodo(other, false)];
		const out = mergeManagedTodos(existing, []);
		expect(out).toEqual([renderManagedTodo(todo, true)]);
	});
});

describe('NoteBlocksParser and managed regions', () => {
	it('journals todos from a region but never its prose or markers', () => {
		const page = [
			'##### [[Activities/Gateway.md|Gateway]]',
			'<!-- 2ndbrain:managed:morning:start -->',
			'Snapshot prose that changes every day',
			renderManagedTodo({ id: 'review@u', text: 'Review in «Gateway»' }, false),
			'<!-- 2ndbrain:managed:morning:end -->',
			'user note',
			'----',
		].join('\n');
		const blocks = new NoteBlocksParser().parse('2026-01-01-Engineer', page).blocks;
		const contents = blocks.map(b => b.content);
		expect(contents.some(c => c.includes('Snapshot prose'))).toBe(false);
		expect(contents.some(c => c.includes('2ndbrain:managed'))).toBe(false);
		expect(contents.some(c => c.includes('Review in «Gateway»'))).toBe(true);
		expect(contents.some(c => c.includes('user note'))).toBe(true);
	});
});
