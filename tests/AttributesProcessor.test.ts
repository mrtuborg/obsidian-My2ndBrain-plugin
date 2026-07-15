import { AttributesProcessor } from '../src/components/AttributesProcessor';

describe('AttributesProcessor.processAttributes', () => {
	const ap = new AttributesProcessor();

	// AP-01
	it('sets a string field via {field: value}', () => {
		const fm: Record<string, unknown> = { stage: 'active' };
		ap.processAttributes(fm, 'Some text {stage: done}');
		expect(fm['stage']).toBe('done');
	});

	// AP-02
	it('sets a numeric field via {field = number}', () => {
		const fm: Record<string, unknown> = { score: 0 };
		ap.processAttributes(fm, '{score = 5}');
		expect(fm['score']).toBe(5);
	});

	// AP-03
	it('increments a field via {field += amount}', () => {
		const fm: Record<string, unknown> = { score: 3 };
		ap.processAttributes(fm, '{score += 2}');
		expect(fm['score']).toBe(5);
	});

	// AP-04
	it('decrements a field via {field -= amount}', () => {
		const fm: Record<string, unknown> = { score: 5 };
		ap.processAttributes(fm, '{score -= 1}');
		expect(fm['score']).toBe(4);
	});

	// AP-05
	it('advances a date field via {startDate += 7d}', () => {
		const fm: Record<string, unknown> = { startDate: '2026-01-01' };
		ap.processAttributes(fm, '{startDate += 7d}');
		expect(fm['startDate']).toBe('2026-01-08');
	});

	// AP-06
	it('regresses a date by weeks via {startDate -= 2w}', () => {
		const fm: Record<string, unknown> = { startDate: '2026-02-14' };
		ap.processAttributes(fm, '{startDate -= 2w}');
		expect(fm['startDate']).toBe('2026-01-31');
	});

	// AP-07
	it('ignores directives inside code blocks', () => {
		const fm: Record<string, unknown> = { stage: 'active' };
		const body = '```js\n{stage: done}\n```';
		ap.processAttributes(fm, body);
		expect(fm['stage']).toBe('active');
	});

	it('converts processed directive from {expr} to (expr) in returned content', () => {
		const fm: Record<string, unknown> = { stage: 'active' };
		const result = ap.processAttributes(fm, 'do this {stage: done} now');
		expect(result).toContain('(stage: done)');
		expect(result).not.toContain('{stage: done}');
	});

	it('handles unknown field by defaulting to empty string', () => {
		const fm: Record<string, unknown> = {};
		ap.processAttributes(fm, '{newField: hello}');
		expect(fm['newField']).toBe('hello');
	});

	it('does not modify frontmatter when body has no directives', () => {
		const fm: Record<string, unknown> = { stage: 'active' };
		ap.processAttributes(fm, 'no directives here');
		expect(fm['stage']).toBe('active');
	});
});
