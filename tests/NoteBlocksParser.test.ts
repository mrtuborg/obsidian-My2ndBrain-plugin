import { NoteBlocksParser } from '../src/components/NoteBlocksParser';
import { Block } from '../src/components/Block';

// ── Line classifier unit tests ──────────────────────────────────────

describe('NoteBlocksParser — isHeader', () => {
	const p = new NoteBlocksParser();

	// NP-01
	const cases: [string, boolean, number | undefined][] = [
		['# Main Title',    true,  1],
		['## Sub',          true,  2],
		['##### Fifth',     true,  5],
		['# ',              false, undefined],   // trailing space only
		['#NoSpace',        false, undefined],
		['  # Indented',    false, undefined],
		['',                false, undefined],
		['# Valid',         true,  1],
		['###### Six',      true,  6],
	];

	test.each(cases)('isHeader(%s) = %s', (line, expected, level) => {
		expect(p.isHeader(line)).toBe(expected);
		if (level !== undefined) {
			expect(p.getHeaderLevel(line)).toBe(level);
		}
	});
});

describe('NoteBlocksParser — isTodoLine', () => {
	const p = new NoteBlocksParser();

	// NP-02
	const cases: [string, boolean][] = [
		['- [ ] Task',          true],
		['- [x] Done',          false],
		['- [ ]',               true],   // no text still counts
		['Task without marker', false],
		['[ ] No dash',         false],
		['  - [ ] Indented',    true],   // trimmed before check
	];

	test.each(cases)('isTodoLine(%s) = %s', (line, expected) => {
		expect(p.isTodoLine(line)).toBe(expected);
	});
});

describe('NoteBlocksParser — isDoneLine', () => {
	const p = new NoteBlocksParser();

	// NP-03
	const cases: [string, boolean][] = [
		['- [x] Completed',  true],
		['- [ ] Open',       false],
		['- [X] Capital X',  false],   // case-sensitive
		['  - [x] Indented', true],
	];

	test.each(cases)('isDoneLine(%s) = %s', (line, expected) => {
		expect(p.isDoneLine(line)).toBe(expected);
	});
});

// ── parse() structural tests ─────────────────────────────────────────

describe('NoteBlocksParser.parse — flat todo list (NP-04)', () => {
	it('creates correct block types and order', () => {
		const p = new NoteBlocksParser();
		const content = `- [ ] Task one\n- [x] Task two\n- [ ] Task three`;
		const col = p.parse('page.md', content);

		expect(col.blocks).toHaveLength(3);
		expect(col.blocks[0]!.isType('todo')).toBe(true);
		expect(col.blocks[0]!.content).toContain('Task one');
		expect(col.blocks[1]!.isType('done')).toBe(true);
		expect(col.blocks[1]!.content).toContain('Task two');
		expect(col.blocks[2]!.isType('todo')).toBe(true);
		expect(col.blocks[2]!.content).toContain('Task three');
		// No header → all root blocks
		for (const b of col.blocks) {
			expect(b.parent).toBeNull();
		}
	});
});

describe('NoteBlocksParser.parse — header with children (NP-05)', () => {
	it('sets parent-child relationship and accumulates header content', () => {
		const p = new NoteBlocksParser();
		const content = [
			'##### [[Activities/My Project.md|My Project]]',
			'- [ ] Task one',
			'- [ ] Task two',
		].join('\n');

		const col = p.parse('Journal/2026-04-04.md', content);

		const headers = col.findByType('header');
		const todos = col.findByType('todo');

		expect(headers).toHaveLength(1);
		expect(todos).toHaveLength(2);

		const header = headers[0]!;
		expect(header.children).toHaveLength(2);
		expect(todos[0]!.parent).toBe(header);
		expect(todos[1]!.parent).toBe(header);

		// Header content accumulates child lines (NP-05)
		expect(header.content).toContain('Task one');
		expect(header.content).toContain('Task two');
	});
});

describe('NoteBlocksParser.parse — separator resets hierarchy (NP-06)', () => {
	it('tasks under different headers have different parents', () => {
		const p = new NoteBlocksParser();
		const content = [
			'##### [[Activities/A.md|A]]',
			'- [ ] Task A',
			'----',
			'##### [[Activities/B.md|B]]',
			'- [ ] Task B',
		].join('\n');

		const col = p.parse('p.md', content);
		const todos = col.findByType('todo');
		expect(todos).toHaveLength(2);

		const taskA = todos.find(b => b.content.includes('Task A'))!;
		const taskB = todos.find(b => b.content.includes('Task B'))!;

		expect(taskA.parent).not.toBeNull();
		expect(taskB.parent).not.toBeNull();
		expect(taskA.parent).not.toBe(taskB.parent);
	});
});

describe('NoteBlocksParser.parse — two blank lines reset hierarchy (NP-07)', () => {
	it('task after two blank lines has null parent', () => {
		const p = new NoteBlocksParser();
		const content = [
			'##### [[Activities/A.md|A]]',
			'- [ ] Task A',
			'',
			'',
			'- [ ] Orphan task',
		].join('\n');

		const col = p.parse('p.md', content);
		const todos = col.findByType('todo');

		const taskA = todos.find(b => b.content.includes('Task A'))!;
		const orphan = todos.find(b => b.content.includes('Orphan'))!;

		expect(taskA.parent).not.toBeNull();
		expect(orphan.parent).toBeNull();
	});
});

describe('NoteBlocksParser.parse — indentation hierarchy (NP-08)', () => {
	it('creates three levels of nesting', () => {
		const p = new NoteBlocksParser();
		const content = [
			'- [ ] Parent task',
			'  - [ ] Child task',
			'    - [ ] Grandchild task',
		].join('\n');

		const col = p.parse('p.md', content);
		const todos = col.findByType('todo');
		expect(todos).toHaveLength(3);

		const parent = todos.find(b => b.content.includes('Parent'))!;
		const child  = todos.find(b => b.content.includes('Child task'))!;
		const grand  = todos.find(b => b.content.includes('Grandchild'))!;

		expect(parent.parent).toBeNull();
		expect(child.parent).toBe(parent);
		expect(grand.parent).toBe(child);

		expect(parent.getAttribute('indentLevel')).toBe(0);
		expect(child.getAttribute('indentLevel')).toBe(2);
		expect(grand.getAttribute('indentLevel')).toBe(4);
	});
});

describe('NoteBlocksParser.parse — code block content ignored (NP-09)', () => {
	it('does not create todo blocks from lines inside a code block', () => {
		const p = new NoteBlocksParser();
		const content = '```javascript\n- [ ] This is code, not a todo\n```';
		const col = p.parse('p.md', content);

		expect(col.findByType('todo')).toHaveLength(0);
		expect(col.findByType('code')).toHaveLength(1);
	});
});

describe('NoteBlocksParser.parse — mention line (NP-10)', () => {
	it('parsed line contains [[...]] wikilink in content', () => {
		const p = new NoteBlocksParser();
		const content = '[[2026-04-04]]';
		const col = p.parse('p.md', content);

		// Should produce at least one block containing the mention
		const withMention = col.blocks.filter(b => b.content.includes('[[2026-04-04]]'));
		expect(withMention.length).toBeGreaterThan(0);
	});
});

describe('NoteBlocksParser.parse — all blocks carry the page path', () => {
	it('every block has the correct page', () => {
		const p = new NoteBlocksParser();
		const content = '- [ ] Task\n- [x] Done';
		const col = p.parse('Journal/2026-04-04.md', content);

		for (const b of col.blocks) {
			expect(b.page).toBe('Journal/2026-04-04.md');
		}
	});
});

describe('NoteBlocksParser.parse — separator block is created', () => {
	it('creates a separator block for ---- lines', () => {
		const p = new NoteBlocksParser();
		const content = '- [ ] Task\n----\n- [ ] Task two';
		const col = p.parse('p.md', content);

		expect(col.findByType('separator')).toHaveLength(1);
	});
});

// ── run() with file filter ───────────────────────────────────────────

describe('NoteBlocksParser.run — date filter (NP-11)', () => {
	it('only parses files whose name matches YYYY-MM-DD', async () => {
		const p = new NoteBlocksParser();

		const mockRead = jest.fn().mockResolvedValue('- [ ] Task');
		const mockGetAbstract = jest.fn().mockReturnValue({ path: 'dummy' });

		const app = {
			vault: {
				read: mockRead,
				getAbstractFileByPath: mockGetAbstract,
			},
		} as unknown as import('../src/components/NoteBlocksParser').AppLike;

		const pages = [
			{ file: { path: 'Journal/2026-04-04.md',  name: '2026-04-04' } },
			{ file: { path: 'Journal/index.md',        name: 'index'      } },
			{ file: { path: 'Journal/2026-W14.md',     name: '2026-W14'   } },
		];

		await p.run(app, pages, 'YYYY-MM-DD');

		// vault.read should only be called once — for '2026-04-04'
		expect(mockRead).toHaveBeenCalledTimes(1);
	});

	it('parses all files when namePattern is null', async () => {
		const p = new NoteBlocksParser();

		const mockRead = jest.fn().mockResolvedValue('- [ ] Task');
		const mockGetAbstract = jest.fn().mockReturnValue({ path: 'dummy' });

		const app = {
			vault: {
				read: mockRead,
				getAbstractFileByPath: mockGetAbstract,
			},
		} as unknown as import('../src/components/NoteBlocksParser').AppLike;

		const pages = [
			{ file: { path: 'Activities/foo.md', name: 'foo' } },
			{ file: { path: 'Activities/bar.md', name: 'bar' } },
		];

		await p.run(app, pages, null);

		expect(mockRead).toHaveBeenCalledTimes(2);
	});

	it('merges blocks from all parsed files into one BlockCollection', async () => {
		const p = new NoteBlocksParser();

		const mockRead = jest.fn()
			.mockResolvedValueOnce('- [ ] Task from first')
			.mockResolvedValueOnce('- [x] Done from second');
		const mockGetAbstract = jest.fn().mockReturnValue({ path: 'dummy' });

		const app = {
			vault: {
				read: mockRead,
				getAbstractFileByPath: mockGetAbstract,
			},
		} as unknown as import('../src/components/NoteBlocksParser').AppLike;

		const pages = [
			{ file: { path: 'Journal/2026-04-04.md', name: '2026-04-04' } },
			{ file: { path: 'Journal/2026-04-05.md', name: '2026-04-05' } },
		];

		const col = await p.run(app, pages, 'YYYY-MM-DD');

		expect(col.findByType('todo')).toHaveLength(1);
		expect(col.findByType('done')).toHaveLength(1);
	});
});
