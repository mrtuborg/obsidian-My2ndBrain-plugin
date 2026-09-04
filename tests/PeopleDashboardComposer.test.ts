import { PeopleDashboardComposer, PEOPLE_CODE_BLOCK_LANG } from '../src/composers/PeopleDashboardComposer';

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
	getFiles() {
		return [...this.files.keys()].map(p => ({
			path: p,
			name: p.split('/').pop()!,
			basename: p.split('/').pop()!.replace(/\.md$/, ''),
		}));
	}
}

function makeApp(files: Record<string, string>) {
	return { vault: new MockVault(files) as any };
}

describe('PeopleDashboardComposer', () => {
	it('stubs a fresh dashboard note with the live code block', async () => {
		const composer = new PeopleDashboardComposer();
		const app = makeApp({ 'Dashboards/People.md': '' });

		await composer.refresh(app, 'Dashboards/People.md');

		const vault = app.vault as MockVault;
		expect(vault.saves.get('Dashboards/People.md')).toContain('```' + PEOPLE_CODE_BLOCK_LANG);
	});

	it('leaves a note alone once it already has the code block', async () => {
		const composer = new PeopleDashboardComposer();
		const existing = '# People\n\n```' + PEOPLE_CODE_BLOCK_LANG + '\n```\n';
		const app = makeApp({ 'Dashboards/People.md': existing });

		await composer.refresh(app, 'Dashboards/People.md');

		const vault = app.vault as MockVault;
		expect(vault.saves.size).toBe(0);
	});

	it('does nothing when the file does not exist', async () => {
		const composer = new PeopleDashboardComposer();
		const app = makeApp({});

		await composer.refresh(app, 'Dashboards/People.md');

		const vault = app.vault as MockVault;
		expect(vault.saves.size).toBe(0);
	});

	it('stub() carries the code block fence', () => {
		expect(new PeopleDashboardComposer().stub()).toContain('```' + PEOPLE_CODE_BLOCK_LANG);
	});
});
