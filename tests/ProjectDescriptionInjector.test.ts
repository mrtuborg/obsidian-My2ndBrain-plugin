import { ProjectDescriptionInjector } from '../src/components/ProjectDescriptionInjector';
import { NoteBlocksParser } from '../src/components/NoteBlocksParser';
import { BlockCollection } from '../src/components/BlockCollection';

const parser = new NoteBlocksParser();

function makeProjectBlocks(projectPath: string, content: string): BlockCollection {
	return parser.parse(projectPath, content);
}

const ACTIVITY_BODY_WITH_SECTIONS = [
	'## Description',
	'',
	'Old description content',
	'',
	'----',
	'',
	'## Journal',
	'',
	'[[2026-04-04]]',
	'- [ ] Some task',
	'',
	'----',
].join('\n');

const ACTIVITY_BODY_NO_DESC = [
	'## Journal',
	'',
	'[[2026-04-04]]',
	'- [ ] Some task',
	'',
	'----',
].join('\n');

describe('ProjectDescriptionInjector.run', () => {
	const pdi = new ProjectDescriptionInjector();

	// PDI-01: block from Projects/ under Activity header → extracted
	it('extracts content blocks from the matching activity header', async () => {
		const projectContent = [
			'##### [[Activities/My Project.md|My Project]]',
			'**Goal:** Fix WiFi crash',
			'**Done when:**',
			'- [ ] 100 clean boots',
		].join('\n');

		const blocks = makeProjectBlocks('Projects/Platform.md', projectContent);
		const result = await pdi.run(ACTIVITY_BODY_WITH_SECTIONS, blocks, 'My Project');

		expect(result).toContain('Fix WiFi crash');
		expect(result).toContain('100 clean boots');
	});

	// PDI-02: block from Journal/ → ignored
	it('ignores blocks whose page is not in Projects/', async () => {
		const journalContent = [
			'##### [[Activities/My Project.md|My Project]]',
			'- [ ] journal task',
		].join('\n');

		const blocks = makeProjectBlocks('Journal/2026-04-04.md', journalContent);
		const result = await pdi.run(ACTIVITY_BODY_WITH_SECTIONS, blocks, 'My Project');

		// ## Description should be cleared (replace-semantics, nothing from Journal)
		const descStart = result.indexOf('## Description');
		const nextSection = result.indexOf('## Journal');
		const descContent = result.slice(descStart, nextSection);
		expect(descContent).not.toContain('journal task');
	});

	// PDI-03: tagId header itself is not copied
	it('does not include the ##### header line itself in description', async () => {
		const projectContent = [
			'##### [[Activities/My Project.md|My Project]]',
			'**Goal:** Fix crash',
		].join('\n');

		const blocks = makeProjectBlocks('Projects/Platform.md', projectContent);
		const result = await pdi.run(ACTIVITY_BODY_WITH_SECTIONS, blocks, 'My Project');

		expect(result).not.toContain('##### [[Activities/My Project.md|My Project]]');
	});

	// PDI-04: separator blocks skipped
	it('does not include separator blocks in description', async () => {
		const projectContent = [
			'##### [[Activities/My Project.md|My Project]]',
			'**Goal:** Fix crash',
			'----',
		].join('\n');

		const blocks = makeProjectBlocks('Projects/Platform.md', projectContent);
		const result = await pdi.run(ACTIVITY_BODY_WITH_SECTIONS, blocks, 'My Project');

		// The description CONTENT should have the goal but no stray ---- from the project separator.
		// Extract the body between ## Description heading and the first ----
		const descStart = result.indexOf('## Description');
		const firstSep = result.indexOf('\n----', descStart);
		const descBody = result.slice(descStart + '## Description'.length, firstSep);
		expect(descBody).toContain('Fix crash');
		// Separator block content ('----') must not appear inside the description body itself
		expect(descBody.trim()).not.toMatch(/^----$/m);
	});

	// PDI-05: multiple project sources → sub-headings
	it('adds source sub-headings when multiple projects define the same activity', async () => {
		const contentA = [
			'##### [[Activities/My Project.md|My Project]]',
			'**From project A**',
		].join('\n');
		const contentB = [
			'##### [[Activities/My Project.md|My Project]]',
			'**From project B**',
		].join('\n');

		const blocksA = makeProjectBlocks('Projects/Alpha.md', contentA);
		const blocksB = makeProjectBlocks('Projects/Beta.md', contentB);
		const merged = BlockCollection.createNew();
		for (const b of [...blocksA.blocks, ...blocksB.blocks]) merged.addBlock(b);

		const result = await pdi.run(ACTIVITY_BODY_WITH_SECTIONS, merged, 'My Project');

		expect(result).toContain('Alpha');
		expect(result).toContain('Beta');
		expect(result).toContain('From project A');
		expect(result).toContain('From project B');
	});

	// PDI-06: replace-semantics — existing ## Description is replaced
	it('replaces existing ## Description content on every call', async () => {
		const projectContent = [
			'##### [[Activities/My Project.md|My Project]]',
			'**New goal**',
		].join('\n');

		const blocks = makeProjectBlocks('Projects/Platform.md', projectContent);
		const result = await pdi.run(ACTIVITY_BODY_WITH_SECTIONS, blocks, 'My Project');

		expect(result).toContain('New goal');
		expect(result).not.toContain('Old description content');
	});

	// PDI-07: no matching project blocks → ## Description cleared
	it('clears ## Description when no project defines this activity', async () => {
		const blocks = BlockCollection.createNew(); // empty
		const result = await pdi.run(ACTIVITY_BODY_WITH_SECTIONS, blocks, 'My Project');

		const descStart = result.indexOf('## Description');
		expect(descStart).toBeGreaterThan(-1);
		const journalStart = result.indexOf('## Journal');
		const descContent = result.slice(descStart + '## Description'.length, journalStart).trim();
		// Description content should be empty or just whitespace
		expect(descContent.replace(/[-\n ]/g, '')).toBe('');
	});

	// PDI-08: no ## Description section → created before ## Journal
	it('inserts ## Description section when it does not exist', async () => {
		const projectContent = [
			'##### [[Activities/My Project.md|My Project]]',
			'**Goal:** New goal',
		].join('\n');

		const blocks = makeProjectBlocks('Projects/Platform.md', projectContent);
		const result = await pdi.run(ACTIVITY_BODY_NO_DESC, blocks, 'My Project');

		const descIdx = result.indexOf('## Description');
		const journalIdx = result.indexOf('## Journal');
		expect(descIdx).toBeGreaterThan(-1);
		expect(descIdx).toBeLessThan(journalIdx);
		expect(result).toContain('New goal');
	});

	// PDI-09: regression — old description containing its own embedded "## "
	// heading (e.g. a pasted runbook) must be fully replaced, not just
	// truncated at the first embedded heading. Previously this caused the
	// leftover tail to be preserved as orphaned body content, and every
	// re-run prepended another fresh copy — unbounded duplication over time
	// (see Activities/monitor.md, which grew to 2.48MB in 8 days).
	it('fully replaces old description content that contains its own embedded ## heading', async () => {
		const activityBody = [
			'## Description',
			'',
			'Old goal text',
			'',
			'## Starting the server',
			'',
			'Some pasted runbook step that happens to use a level-2 heading',
			'',
			'----',
			'',
			'## Journal',
			'',
			'[[2026-04-04]]',
			'- [ ] Some task',
			'',
			'----',
		].join('\n');

		const projectContent = [
			'##### [[Activities/My Project.md|My Project]]',
			'**New goal**',
		].join('\n');

		const blocks = makeProjectBlocks('Projects/Platform.md', projectContent);
		const result = await pdi.run(activityBody, blocks, 'My Project');

		expect(result).toContain('New goal');
		expect(result).not.toContain('Old goal text');
		expect(result).not.toContain('Starting the server');
		expect(result).not.toContain('pasted runbook step');
		// Description block should appear exactly once, not duplicated
		expect(result.match(/^## Description\s*$/gm)?.length).toBe(1);
		// Journal section must be preserved
		expect(result).toContain('## Journal');
		expect(result).toContain('- [ ] Some task');
	});

	// Invariant: ## Journal section is not touched
	it('preserves ## Journal section unchanged', async () => {
		const projectContent = [
			'##### [[Activities/My Project.md|My Project]]',
			'**Goal:** Fix crash',
		].join('\n');

		const blocks = makeProjectBlocks('Projects/Platform.md', projectContent);
		const result = await pdi.run(ACTIVITY_BODY_WITH_SECTIONS, blocks, 'My Project');

		expect(result).toContain('## Journal');
		expect(result).toContain('[[2026-04-04]]');
		expect(result).toContain('- [ ] Some task');
	});
});
