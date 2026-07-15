import { AutoActivityCreator } from '../src/components/AutoActivityCreator';

const TODAY = new Date().toISOString().slice(0, 10);

function makeApp(opts: {
	existingPaths?: string[];
	createMock?: jest.Mock;
	createFolderMock?: jest.Mock;
}) {
	const existing = new Set(opts.existingPaths ?? []);
	const create = opts.createMock ?? jest.fn().mockResolvedValue({});
	const createFolder = opts.createFolderMock ?? jest.fn().mockResolvedValue(undefined);

	return {
		vault: {
			getAbstractFileByPath: jest.fn((path: string) => existing.has(path) ? { path } : null),
			create,
			createFolder,
		},
	} as any;
}

describe('AutoActivityCreator', () => {
	const creator = new AutoActivityCreator();

	// AAC-01: unresolved [[Activities/Name.md]] → creates Activities/Name.md
	it('creates a missing activity file referenced with full path', async () => {
		const createMock = jest.fn().mockResolvedValue({});
		const app = makeApp({ createMock });

		await creator.createMissingFromContent(
			app, '[[Activities/Fix WiFi driver.md|Fix WiFi driver]]', TODAY, 'inbox'
		);

		expect(createMock).toHaveBeenCalledWith(
			'Activities/Fix WiFi driver.md',
			expect.any(String)
		);
	});

	// AAC-02: resolved link (file exists) → no create call
	it('skips links whose file already exists', async () => {
		const createMock = jest.fn().mockResolvedValue({});
		const app = makeApp({ existingPaths: ['Activities/Existing.md'], createMock });

		await creator.createMissingFromContent(app, '[[Activities/Existing.md|Existing]]', TODAY, 'inbox');

		expect(createMock).not.toHaveBeenCalled();
	});

	// AAC-03: date link [[2026-04-04]] → skipped
	it('skips YYYY-MM-DD date links', async () => {
		const createMock = jest.fn().mockResolvedValue({});
		const app = makeApp({ createMock });

		await creator.createMissingFromContent(app, '[[2026-04-04]]', TODAY, 'inbox');

		expect(createMock).not.toHaveBeenCalled();
	});

	// AAC-04: week link [[2026-W14]] → skipped
	it('skips ISO week links', async () => {
		const createMock = jest.fn().mockResolvedValue({});
		const app = makeApp({ createMock });

		await creator.createMissingFromContent(app, '[[2026-W14]]', TODAY, 'inbox');
		expect(createMock).not.toHaveBeenCalled();
	});

	// Skips YYYY-MM and YYYY links too
	it('skips YYYY-MM and YYYY date-like links', async () => {
		const createMock = jest.fn().mockResolvedValue({});
		const app = makeApp({ createMock });

		await creator.createMissingFromContent(app, '[[2026-04]] [[2026]]', TODAY, 'inbox');
		expect(createMock).not.toHaveBeenCalled();
	});

	// AAC-05: [[People/Name]] → creates People/Name.md
	it('creates People/ file for People/ prefixed links', async () => {
		const createMock = jest.fn().mockResolvedValue({});
		const app = makeApp({ createMock });

		await creator.createMissingFromContent(app, '[[People/Ivan]]', TODAY, 'inbox');

		expect(createMock).toHaveBeenCalledWith('People/Ivan.md', expect.any(String));
	});

	// AAC-06: [[Name]] (no folder) → creates Activities/Name.md
	it('defaults bare links to Activities/ folder', async () => {
		const createMock = jest.fn().mockResolvedValue({});
		const app = makeApp({ createMock });

		await creator.createMissingFromContent(app, '[[Fix WiFi driver]]', TODAY, 'inbox');

		expect(createMock).toHaveBeenCalledWith('Activities/Fix WiFi driver.md', expect.any(String));
	});

	// AAC-07: [[Projects/Something]] → skipped
	it('skips links targeting Projects/ folder', async () => {
		const createMock = jest.fn().mockResolvedValue({});
		const app = makeApp({ createMock });

		await creator.createMissingFromContent(app, '[[Projects/Platform.md|Platform]]', TODAY, 'inbox');

		expect(createMock).not.toHaveBeenCalled();
	});

	// AAC-08: Projects/ source → project field set to the project path
	it('sets project field to project path when source is Projects/', async () => {
		const createMock = jest.fn().mockResolvedValue({});
		const app = makeApp({ createMock });

		await creator.createMissingFromContent(
			app, '[[Activities/New Feature.md|New Feature]]', TODAY, 'Projects/Platform.md'
		);

		const createdContent: string = createMock.mock.calls[0][1];
		expect(createdContent).toContain('project: Projects/Platform.md');
	});

	// AAC-09: Journal source → project field set to "inbox"
	it('sets project field to inbox when source is Journal', async () => {
		const createMock = jest.fn().mockResolvedValue({});
		const app = makeApp({ createMock });

		await creator.createMissingFromContent(
			app, '[[Activities/Quick Fix.md|Quick Fix]]', TODAY, 'inbox'
		);

		const createdContent: string = createMock.mock.calls[0][1];
		expect(createdContent).toContain('project: inbox');
	});

	// AAC-10: created file has standard frontmatter + ## Description + ## Journal
	it('created file contains all required sections', async () => {
		const createMock = jest.fn().mockResolvedValue({});
		const app = makeApp({ createMock });

		await creator.createMissingFromContent(app, '[[Activities/New.md]]', TODAY, 'inbox');

		const content: string = createMock.mock.calls[0][1];
		expect(content).toContain('startDate:');
		expect(content).toContain('stage: active');
		expect(content).toContain('## Description');
		expect(content).toContain('## Journal');
	});

	// AAC-11: parent folder created if missing
	it('creates parent folder before creating the file', async () => {
		const createMock = jest.fn().mockResolvedValue({});
		const createFolderMock = jest.fn().mockResolvedValue(undefined);
		const app = makeApp({ createMock, createFolderMock });

		// People/ folder doesn't exist
		await creator.createMissingFromContent(app, '[[People/NewPerson]]', TODAY, 'inbox');

		expect(createFolderMock).toHaveBeenCalledWith('People');
	});

	// AAC-12: file already exists at creation time → no error (idempotent)
	it('handles "file already exists" error gracefully', async () => {
		const createMock = jest.fn().mockRejectedValue(new Error('File already exists'));
		const app = makeApp({ createMock });

		// Should not throw
		await expect(
			creator.createMissingFromContent(app, '[[Activities/Existing.md]]', TODAY, 'inbox')
		).resolves.not.toThrow();
	});

	// Multiple links in one content string
	it('creates files for all unresolved links in content', async () => {
		const createMock = jest.fn().mockResolvedValue({});
		const app = makeApp({ createMock });

		const content = '[[Activities/A.md|A]] [[Activities/B.md|B]] [[Activities/C.md|C]]';
		await creator.createMissingFromContent(app, content, TODAY, 'inbox');

		expect(createMock).toHaveBeenCalledTimes(3);
	});

	// Duplicate link in content → created only once
	it('deduplicates links — same path created at most once', async () => {
		const createMock = jest.fn().mockResolvedValue({});
		const app = makeApp({ createMock });

		const content = '[[Activities/A.md|A]] [[Activities/A.md|A again]]';
		await creator.createMissingFromContent(app, content, TODAY, 'inbox');

		expect(createMock).toHaveBeenCalledTimes(1);
	});
});
