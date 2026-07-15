import { FileIO } from '../src/utilities/FileIO';

const TODAY = new Date().toISOString().slice(0, 10);

// ── FIO-01 ───────────────────────────────────────────────────────────
describe('FileIO.todayDate', () => {
	it('returns a string matching YYYY-MM-DD', () => {
		const io = new FileIO();
		expect(io.todayDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

// ── FIO-02 / FIO-03 ──────────────────────────────────────────────────
describe('FileIO.isDailyNote', () => {
	it('returns true for today', () => {
		const io = new FileIO();
		expect(io.isDailyNote(TODAY)).toBe(true);
	});

	it('returns false for a past date', () => {
		const io = new FileIO();
		expect(io.isDailyNote('2025-01-01')).toBe(false);
	});

	it('returns false for a future date', () => {
		const io = new FileIO();
		expect(io.isDailyNote('2099-12-31')).toBe(false);
	});
});

// ── FIO-04 / FIO-05 / FIO-06 ─────────────────────────────────────────
describe('FileIO.generateActivityHeader', () => {
	const io = new FileIO();

	it('FIO-04: generates correct output for valid input with type', () => {
		const result = io.generateActivityHeader('2026-04-04', 'doing', ['Me'], 'inbox');
		expect(result).toContain('startDate: 2026-04-04');
		expect(result).toContain('stage: doing');
		expect(result).toContain('type: inbox');
		expect(result).toContain('responsible: [Me]');
		expect(result.startsWith('---')).toBe(true);
		expect(result.endsWith('---')).toBe(true);
	});

	it('FIO-05: throws for invalid stage', () => {
		expect(() =>
			io.generateActivityHeader('2026-04-04', 'pending', ['Me'])
		).toThrow();
	});

	it('FIO-06: no type line when type is null', () => {
		const result = io.generateActivityHeader('2026-04-04', 'doing', ['Me'], null);
		expect(result).not.toContain('type:');
	});

	it('generates valid done stage', () => {
		const result = io.generateActivityHeader('2026-04-04', 'done', ['Me']);
		expect(result).toContain('stage: done');
	});

	it('throws for invalid date format', () => {
		expect(() =>
			io.generateActivityHeader('not-a-date', 'doing', ['Me'])
		).toThrow();
	});

	it('preserves extra fields in output', () => {
		const result = io.generateActivityHeader('2026-04-04', 'doing', ['Me'], null, {
			priority: 'high',
			wiki: '',
		});
		expect(result).toContain('priority: high');
		// Empty string extra fields should be skipped
		expect(result).not.toContain('wiki:');
	});
});

// ── FIO-07 / FIO-08 ──────────────────────────────────────────────────
describe('FileIO.extractFrontmatterAndDataviewJs', () => {
	const io = new FileIO();

	it('FIO-07: splits content into three parts correctly', () => {
		const content = [
			'---',
			'startDate: 2026-04-04',
			'stage: doing',
			'---',
			'',
			'```dataviewjs',
			'const x = 1;',
			'```',
			'',
			'Body content here',
		].join('\n');

		const { frontmatter, dataviewJsBlock, pageContent } = io.extractFrontmatterAndDataviewJs(content);

		expect(frontmatter).toContain('startDate: 2026-04-04');
		expect(frontmatter).toContain('stage: doing');
		expect(dataviewJsBlock).toContain('```dataviewjs');
		expect(dataviewJsBlock).toContain('const x = 1;');
		expect(pageContent).toContain('Body content here');
		expect(pageContent).not.toContain('startDate');
	});

	it('FIO-08: frontmatter is empty when content starts with dataviewjs', () => {
		const content = '```dataviewjs\nconst x = 1;\n```\nBody';
		const { frontmatter, dataviewJsBlock, pageContent } = io.extractFrontmatterAndDataviewJs(content);

		expect(frontmatter).toBe('');
		expect(dataviewJsBlock).toContain('```dataviewjs');
		expect(pageContent).toContain('Body');
	});

	it('handles content with no frontmatter and no dataviewjs', () => {
		const content = 'Just plain content';
		const { frontmatter, dataviewJsBlock, pageContent } = io.extractFrontmatterAndDataviewJs(content);

		expect(frontmatter).toBe('');
		expect(dataviewJsBlock).toBe('');
		expect(pageContent).toContain('Just plain content');
	});
});

// ── parseFrontmatterField ────────────────────────────────────────────
describe('FileIO.parseFrontmatterField', () => {
	const io = new FileIO();
	const sample = '---\nstartDate: 2026-04-04\nstage: doing\nproject: Projects/Foo.md\n---\nbody';

	it('reads a scalar field correctly', () => {
		expect(io.parseFrontmatterField(sample, 'stage')).toBe('doing');
	});

	it('reads a date field correctly', () => {
		expect(io.parseFrontmatterField(sample, 'startDate')).toBe('2026-04-04');
	});

	it('reads a path field correctly', () => {
		expect(io.parseFrontmatterField(sample, 'project')).toBe('Projects/Foo.md');
	});

	it('returns null for a missing field', () => {
		expect(io.parseFrontmatterField(sample, 'budget')).toBeNull();
	});

	it('returns null when content is empty string', () => {
		expect(io.parseFrontmatterField('', 'stage')).toBeNull();
	});
});

// ── parseExtraFrontmatterFields ──────────────────────────────────────
describe('FileIO.parseExtraFrontmatterFields', () => {
	const io = new FileIO();
	const STANDARD = new Set(['startDate', 'stage', 'responsible', 'type', 'project']);

	it('parses scalar extra fields', () => {
		const content = '---\nstartDate: 2026-04-04\npriority: high\n---';
		const extra = io.parseExtraFrontmatterFields(content, STANDARD);
		expect(extra['priority']).toBe('high');
		expect(extra['startDate']).toBeUndefined();
	});

	it('parses inline sequence: responsible: [Me]', () => {
		const content = '---\nresponsible: [Me, Alice]\n---';
		const extra = io.parseExtraFrontmatterFields(content, new Set());
		expect(Array.isArray(extra['responsible'])).toBe(true);
		expect(extra['responsible']).toContain('Me');
		expect(extra['responsible']).toContain('Alice');
	});

	it('parses block list: context_refs', () => {
		const content = '---\ncontext_refs:\n  - path/to/ref.md\n  - path/to/other.md\n---';
		const extra = io.parseExtraFrontmatterFields(content, STANDARD);
		expect(Array.isArray(extra['context_refs'])).toBe(true);
		expect(extra['context_refs']).toHaveLength(2);
	});

	it('parses empty scalar: wiki:', () => {
		const content = '---\nwiki:\n---';
		const extra = io.parseExtraFrontmatterFields(content, STANDARD);
		expect(extra['wiki']).toBe('');
	});

	it('returns {} when no frontmatter', () => {
		expect(io.parseExtraFrontmatterFields('no frontmatter', STANDARD)).toEqual({});
	});
});

// ── generateDailyNoteHeader ──────────────────────────────────────────
describe('FileIO.generateDailyNoteHeader', () => {
	const io = new FileIO();

	it('contains empty frontmatter', () => {
		const h = io.generateDailyNoteHeader('2026-04-04');
		expect(h).toContain('---\n---');
	});

	it('contains correct day, month link, and year link', () => {
		const h = io.generateDailyNoteHeader('2026-04-04');
		expect(h).toContain('### 04');
		expect(h).toContain('[[2026-04|April]]');
		expect(h).toContain('[[2026]]');
	});

	it('contains a week link', () => {
		const h = io.generateDailyNoteHeader('2026-04-04');
		// Week line should reference a YYYY-Www link
		expect(h).toMatch(/\[\[2026-W\d{2}/);
	});
});

// ── loadFile / saveFile ──────────────────────────────────────────────
describe('FileIO.loadFile', () => {
	it('returns file content via app.vault.read', async () => {
		const io = new FileIO();
		const mockFile = { path: 'test.md' };
		const app = {
			vault: {
				getAbstractFileByPath: jest.fn().mockReturnValue(mockFile),
				read: jest.fn().mockResolvedValue('hello content'),
			},
		} as any;

		const result = await io.loadFile(app, 'test.md');
		expect(result).toBe('hello content');
	});

	it('returns null when file not found', async () => {
		const io = new FileIO();
		const app = {
			vault: {
				getAbstractFileByPath: jest.fn().mockReturnValue(null),
				read: jest.fn(),
			},
		} as any;

		const result = await io.loadFile(app, 'missing.md');
		expect(result).toBeNull();
	});
});

describe('FileIO.saveFile', () => {
	it('calls app.vault.modify with the content', async () => {
		const io = new FileIO();
		const mockFile = { path: 'test.md' };
		const mockModify = jest.fn().mockResolvedValue(undefined);
		const app = {
			vault: {
				getAbstractFileByPath: jest.fn().mockReturnValue(mockFile),
				modify: mockModify,
			},
			metadataCache: { getFileCache: jest.fn() },
		} as any;

		await io.saveFile(app, 'test.md', 'new content');
		expect(mockModify).toHaveBeenCalledWith(mockFile, 'new content');
	});

	it('does not call modify when content is empty', async () => {
		const io = new FileIO();
		const mockModify = jest.fn();
		const app = {
			vault: {
				getAbstractFileByPath: jest.fn().mockReturnValue({ path: 'test.md' }),
				modify: mockModify,
			},
			metadataCache: { getFileCache: jest.fn() },
		} as any;

		await io.saveFile(app, 'test.md', '   ');
		expect(mockModify).not.toHaveBeenCalled();
	});
});
