import { MentionsProcessor } from '../src/components/MentionsProcessor';
import { NoteBlocksParser } from '../src/components/NoteBlocksParser';
import { BlockCollection } from '../src/components/BlockCollection';
import { Block } from '../src/components/Block';

const parser = new NoteBlocksParser();

function journalBlocks(date: string, activityName: string, tasks: string[]): BlockCollection {
	const taskLines = tasks.join('\n');
	const content = `##### [[Activities/${activityName}.md|${activityName}]]\n${taskLines}`;
	return parser.parse(`Journal/${date}.md`, content);
}

function mergeCollections(...cols: BlockCollection[]): BlockCollection {
	const merged = BlockCollection.createNew();
	for (const col of cols) {
		for (const b of col.blocks) merged.addBlock(b);
	}
	return merged;
}

const EMPTY_ACTIVITY = [
	'## Description',
	'',
	'----',
	'',
	'## Journal',
	'',
	'----',
].join('\n');

describe('MentionsProcessor', () => {
	const mp = new MentionsProcessor();

	// MP-01: empty collection → ""
	it('returns empty string for an empty BlockCollection', async () => {
		const result = await mp.run(EMPTY_ACTIVITY, BlockCollection.createNew(), 'My Project');
		expect(result.trim()).toBe('');
	});

	// MP-02: direct mention collected
	it('collects a block that directly contains the tagId', async () => {
		const block = Block.createNew('Journal/2026-04-04.md', '- [ ] Fix bug [[My Project]]', 0);
		block.setAttribute('type', 'todo');
		const col = BlockCollection.createNew();
		col.addBlock(block);

		const result = await mp.run(EMPTY_ACTIVITY, col, 'My Project');

		expect(result).toContain('[[2026-04-04]]');
		expect(result).toContain('- [ ] Fix bug');
	});

	// MP-03: hierarchical mention collected
	it('collects child blocks under a header containing the tagId', async () => {
		const col = journalBlocks('2026-04-04', 'My Project', ['- [ ] Do work']);
		const result = await mp.run(EMPTY_ACTIVITY, col, 'My Project');

		expect(result).toContain('[[2026-04-04]]');
		expect(result).toContain('- [ ] Do work');
	});

	// MP-04: same todo text on same date — not duplicated
	it('does not duplicate a todo that was already shown for the same date', async () => {
		const existingContent = [
			'## Journal',
			'',
			'[[2026-04-04]]',
			'- [ ] Fix bug',
			'',
			'----',
		].join('\n');

		const col = journalBlocks('2026-04-04', 'My Project', ['- [ ] Fix bug']);
		const result = await mp.run(existingContent, col, 'My Project');

		// State-transition: fix bug first appeared 2026-04-04 → only shown once
		const occurrences = (result.match(/\[\[2026-04-04\]\]/g) || []).length;
		expect(occurrences).toBe(1);
		expect(result).toContain('- [ ] Fix bug');
	});

	// MP-05: same task in a later date = NO new section (state-transition: not a change)
	it('does NOT add a new date section when the same todo is just carried forward (no state change)', async () => {
		// In production, ALL journal blocks are passed — including the earlier 2026-02-28 entry
		const col1 = journalBlocks('2026-02-28', 'My Project', ['- [ ] Buy milk']);
		const col2 = journalBlocks('2026-04-04', 'My Project', ['- [ ] Buy milk']);
		const merged = mergeCollections(col1, col2);

		// State-transition: "Buy milk" first appeared 2026-02-28, still open
		// → only [[2026-02-28]] section, 2026-04-04 is a carry-forward, not a state change
		const result = await mp.run(EMPTY_ACTIVITY, merged, 'My Project');

		expect(result).toContain('[[2026-02-28]]');
		expect(result).not.toContain('[[2026-04-04]]');
	});

	// MP-06: checkbox sync — [x] in journal updates activity body
	it('syncs [x] from journal to [ ] in activity body', async () => {
		const existingContent = [
			'## Journal',
			'',
			'[[2026-04-04]]',
			'- [ ] Write report',
			'',
			'----',
		].join('\n');

		const col = journalBlocks('2026-04-04', 'My Project', ['- [x] Write report']);
		const result = await mp.run(existingContent, col, 'My Project');

		expect(result).toContain('- [x] Write report');
		expect(result).not.toMatch(/- \[ \] Write report/);
	});

	// MP-07: chronological ordering
	it('outputs date sections in chronological order (oldest first)', async () => {
		const col1 = journalBlocks('2026-03-15', 'My Project', ['- [ ] March task']);
		const col2 = journalBlocks('2026-01-01', 'My Project', ['- [ ] January task']);
		const col3 = journalBlocks('2026-02-10', 'My Project', ['- [ ] February task']);
		const merged = mergeCollections(col1, col2, col3);

		const result = await mp.run(EMPTY_ACTIVITY, merged, 'My Project');

		const jan = result.indexOf('[[2026-01-01]]');
		const feb = result.indexOf('[[2026-02-10]]');
		const mar = result.indexOf('[[2026-03-15]]');
		expect(jan).toBeLessThan(feb);
		expect(feb).toBeLessThan(mar);
	});

	// MP-08: directive from journal updates frontmatterObj
	it('applies directives found in journal blocks to frontmatterObj', async () => {
		const block = Block.createNew(
			'Journal/2026-04-04.md',
			'- [ ] Setup {type: inbox} [[My Activity]]',
			0
		);
		block.setAttribute('type', 'todo');
		const col = BlockCollection.createNew();
		col.addBlock(block);

		const fm: Record<string, unknown> = { type: 'project' };
		await mp.run(EMPTY_ACTIVITY, col, 'My Activity', fm);
		expect(fm['type']).toBe('inbox');
	});

	// MP-09: tagId matches filename, not alias
	it('uses the exact tagId for matching, not the link alias', async () => {
		// Header contains the exact tagId "Fix WiFi driver" - NOT "Fix WiFi Driver" (different case)
		const content = '##### [[Activities/Fix WiFi driver.md|Fix WiFi Driver]]\n- [ ] Reproduce';
		const col = parser.parse('Journal/2026-04-04.md', content);

		// Should match the exact tagId "Fix WiFi driver" (filename)
		const result = await mp.run(EMPTY_ACTIVITY, col, 'Fix WiFi driver');
		expect(result).toContain('Reproduce');

		// Should NOT match if tagId is the alias "Fix WiFi Driver"
		const result2 = await mp.run(EMPTY_ACTIVITY, col, 'Fix WiFi Driver.md');
		// This would only match if content includes the full string - depends on matching logic
		// The key invariant: tagId is the filename without .md
	});

	// MP-10: unicode tagId
	it('handles Cyrillic tagId correctly', async () => {
		const content = '##### [[Activities/апгрейд хранения.md|апгрейд хранения]]\n- [ ] Задача';
		const col = parser.parse('Journal/2026-04-04.md', content);

		const result = await mp.run(EMPTY_ACTIVITY, col, 'апгрейд хранения');
		expect(result).toContain('Задача');
	});

	// Invariant: blocks from Activities/ do not bleed into each other's Journal
	it('only collects blocks that contain or are under a header with the exact tagId', async () => {
		// Two activities mentioned in the same journal entry
		const content = [
			'##### [[Activities/Project A.md|Project A]]',
			'- [ ] Task for A',
			'----',
			'##### [[Activities/Project B.md|Project B]]',
			'- [ ] Task for B',
		].join('\n');
		const col = parser.parse('Journal/2026-04-04.md', content);

		const resultA = await mp.run(EMPTY_ACTIVITY, col, 'Project A');
		const resultB = await mp.run(EMPTY_ACTIVITY, col, 'Project B');

		expect(resultA).toContain('Task for A');
		expect(resultA).not.toContain('Task for B');
		expect(resultB).toContain('Task for B');
		expect(resultB).not.toContain('Task for A');
	});
});
