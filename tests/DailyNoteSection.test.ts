import {
	parseActivityBlocks,
	blockHasContent,
	removeEmptyActivityBlock,
} from '../src/utilities/DailyNoteSection';

const NOTE = [
	'---',
	'---',
	'### 01 [[2026-09|September]]',
	'',
	'----',
	'',
	'<!-- 2ndbrain:activities-built -->',
	'----',
	'##### [[Activities/Busy.md|Busy]]',
	'- [ ] a real todo',
	'- [ ] another',
	'----',
	'##### [[Activities/Empty.md|Empty]]',
	'----',
	'##### [[Activities/Blank.md|Blank]]',
	'',
	'   ',
	'----',
].join('\n');

describe('parseActivityBlocks', () => {
	it('finds every activity heading with its path and display name', () => {
		const blocks = parseActivityBlocks(NOTE);
		expect(blocks.map(b => b.path)).toEqual([
			'Activities/Busy.md', 'Activities/Empty.md', 'Activities/Blank.md',
		]);
		expect(blocks[0]!.name).toBe('Busy');
	});

	it('captures the body verbatim, stopping at the separator', () => {
		expect(parseActivityBlocks(NOTE)[0]!.body).toEqual(['- [ ] a real todo', '- [ ] another']);
	});

	it('ignores the note header and the built marker', () => {
		expect(parseActivityBlocks(NOTE)).toHaveLength(3);
	});

	it('falls back to the path when a link has no display name', () => {
		const blocks = parseActivityBlocks('##### [[Activities/Foo.md]]\n----');
		expect(blocks[0]!.name).toBe('Activities/Foo.md');
	});

	it('closes a trailing block that was never terminated', () => {
		const blocks = parseActivityBlocks('##### [[Activities/Foo.md|Foo]]\n- [ ] x');
		expect(blocks).toHaveLength(1);
		expect(blocks[0]!.body).toEqual(['- [ ] x']);
	});

	it('returns nothing for a note with no activities section', () => {
		expect(parseActivityBlocks('# Just a note\n\nsome prose')).toEqual([]);
	});
});

describe('blockHasContent', () => {
	it('treats real lines as content and whitespace as empty', () => {
		const [busy, empty, blank] = parseActivityBlocks(NOTE);
		expect(blockHasContent(busy!)).toBe(true);
		expect(blockHasContent(empty!)).toBe(false);
		expect(blockHasContent(blank!)).toBe(false);
	});
});

describe('removeEmptyActivityBlock', () => {
	it('removes an empty block along with its separator', () => {
		const out = removeEmptyActivityBlock(NOTE, 'Activities/Empty.md')!;
		expect(out).not.toContain('Empty');
		expect(out.split('----')).toHaveLength(NOTE.split('----').length - 1);
	});

	it('removes a block whose body is only blank lines', () => {
		const out = removeEmptyActivityBlock(NOTE, 'Activities/Blank.md')!;
		expect(out).not.toContain('Blank');
	});

	// The whole point: a day's record is never deleted by a button.
	it('refuses to remove a block that has content', () => {
		expect(removeEmptyActivityBlock(NOTE, 'Activities/Busy.md')).toBeNull();
	});

	it('reports no change when the activity is not in the note', () => {
		expect(removeEmptyActivityBlock(NOTE, 'Activities/Absent.md')).toBeNull();
	});

	it('leaves every other block and the note header untouched', () => {
		const out = removeEmptyActivityBlock(NOTE, 'Activities/Empty.md')!;
		expect(out).toContain('### 01 [[2026-09|September]]');
		expect(out).toContain('<!-- 2ndbrain:activities-built -->');
		expect(out).toContain('- [ ] a real todo');
		expect(out).toContain('##### [[Activities/Blank.md|Blank]]');
	});

	it('matches paths regardless of case', () => {
		expect(removeEmptyActivityBlock(NOTE, 'activities/empty.MD')).not.toBeNull();
	});
});
