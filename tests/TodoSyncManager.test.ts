import { TodoSyncManager } from '../src/components/TodoSyncManager';

describe('TodoSyncManager', () => {
	function makeApp(files: Array<{ path: string; content: string }>) {
		const fileMap = new Map(files.map(f => [f.path, f]));
		return {
			vault: {
				getFiles: jest.fn(() => files.map(f => ({ path: f.path, name: f.path.split('/').pop()! }))),
				getAbstractFileByPath: jest.fn((p: string) => fileMap.has(p) ? { path: p } : null),
				read: jest.fn(async (file: { path: string }) => fileMap.get(file.path)?.content ?? ''),
				modify: jest.fn(async () => {}),
			},
		} as any;
	}

	function activeContent(startDate = '2026-01-01') {
		return `---\nstartDate: ${startDate}\nstage: doing\nremind: daily\n---\n\n## Journal\n\n- [ ] Task\n\n----`;
	}

	function doneContent() {
		return `---\nstartDate: 2026-01-01\nstage: done\nremind: daily\n---\n\n## Journal\n\n----`;
	}

	// TSM-01: in-progress activity → processActivity called for it
	it('calls processActivity for each in-progress activity', async () => {
		const mockProcessActivity = jest.fn().mockResolvedValue(undefined);
		const tsm = new TodoSyncManager(mockProcessActivity);

		const app = makeApp([
			{ path: 'Activities/active.md', content: activeContent() },
		]);

		await tsm.run(app);
		expect(mockProcessActivity).toHaveBeenCalledTimes(1);
		expect(mockProcessActivity).toHaveBeenCalledWith(
			app,
			expect.objectContaining({ path: 'Activities/active.md' }),
			undefined
		);
	});

	// TSM-02: archived activity NOT touched
	it('does not call processActivity for archived activities', async () => {
		const mockProcessActivity = jest.fn().mockResolvedValue(undefined);
		const tsm = new TodoSyncManager(mockProcessActivity);

		const app = makeApp([
			{ path: 'Activities/Archive/old.md', content: activeContent() },
		]);

		await tsm.run(app);
		expect(mockProcessActivity).not.toHaveBeenCalled();
	});

	// TSM-03: done activity NOT touched
	it('does not call processActivity for done activities', async () => {
		const mockProcessActivity = jest.fn().mockResolvedValue(undefined);
		const tsm = new TodoSyncManager(mockProcessActivity);

		const app = makeApp([
			{ path: 'Activities/finished.md', content: doneContent() },
		]);

		await tsm.run(app);
		expect(mockProcessActivity).not.toHaveBeenCalled();
	});

	// TSM-04: multiple activities — all in-progress ones processed
	it('processes all in-progress activities in one run', async () => {
		const mockProcessActivity = jest.fn().mockResolvedValue(undefined);
		const tsm = new TodoSyncManager(mockProcessActivity);

		const app = makeApp([
			{ path: 'Activities/a.md', content: activeContent() },
			{ path: 'Activities/b.md', content: activeContent() },
			{ path: 'Activities/done.md', content: doneContent() },
		]);

		await tsm.run(app);
		expect(mockProcessActivity).toHaveBeenCalledTimes(2);
	});

	// Size safety guard: oversized activities must be skipped, not handed to
	// processActivity (which would throw and abort the whole sync loop).
	it('skips an oversized activity without calling processActivity or aborting the loop', async () => {
		const mockProcessActivity = jest.fn().mockResolvedValue(undefined);
		const tsm = new TodoSyncManager(mockProcessActivity);

		const oversized = activeContent() + '\n' + 'x'.repeat(800 * 1024); // 800KB > 720KB cap
		const app = makeApp([
			{ path: 'Activities/huge.md', content: oversized },
			{ path: 'Activities/normal.md', content: activeContent() },
		]);

		await tsm.run(app);
		expect(mockProcessActivity).toHaveBeenCalledTimes(1);
		expect(mockProcessActivity).toHaveBeenCalledWith(
			app,
			expect.objectContaining({ path: 'Activities/normal.md' }),
			undefined
		);
	});
});
