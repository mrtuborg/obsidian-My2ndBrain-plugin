import { HomeComposer, HOME_CODE_BLOCK_LANG } from '../src/composers/HomeComposer';

class MockVault {
	private files: Map<string, string>;
	saves: Map<string, string> = new Map();

	constructor(files: Record<string, string>) {
		this.files = new Map(Object.entries(files));
	}

	getAbstractFileByPath(path: string) {
		return this.files.has(path) ? { path } : null;
	}
	async read(file: { path: string }) { return this.files.get(file.path) ?? ''; }
	async modify(file: { path: string }, content: string) {
		this.saves.set(file.path, content);
		this.files.set(file.path, content);
	}
}

function makeApp(files: Record<string, string>) {
	return { vault: new MockVault(files) as any };
}

describe('HomeComposer', () => {
	it('refresh() installs the live-view code block stub', async () => {
		const app = makeApp({ 'Home.md': '' });
		const composer = new HomeComposer();

		await composer.refresh(app, 'Home.md');

		const saved = app.vault.saves.get('Home.md');
		expect(saved).toContain('# Home');
		expect(saved).toContain('```' + HOME_CODE_BLOCK_LANG);
	});

	it('refresh() leaves a note that already has the block completely alone', async () => {
		const existing = '---\n---\n# Home\n\nmy own notes\n\n```' + HOME_CODE_BLOCK_LANG + '\n```\n';
		const app = makeApp({ 'Home.md': existing });
		const composer = new HomeComposer();

		await composer.refresh(app, 'Home.md');

		expect(app.vault.saves.size).toBe(0);
	});

	it('refresh() no-ops when the file does not exist', async () => {
		const app = makeApp({});
		const composer = new HomeComposer();

		await composer.refresh(app, 'Home.md');

		expect(app.vault.saves.size).toBe(0);
	});

	it('stub() contains the code block fence', () => {
		expect(new HomeComposer().stub()).toContain('```' + HOME_CODE_BLOCK_LANG);
	});
});
