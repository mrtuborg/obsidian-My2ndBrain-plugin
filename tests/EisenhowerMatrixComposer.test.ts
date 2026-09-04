import { EisenhowerMatrixComposer, MATRIX_CODE_BLOCK_LANG } from '../src/composers/EisenhowerMatrixComposer';

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

const SETTINGS = {
	activitiesFolder: 'Activities',
	archiveFolder: 'Activities/Archive',
};

function activityContent(stage: string, priority: string, role = ''): string {
	return [
		'---',
		'startDate: 2026-01-05',
		`stage: ${stage}`,
		'responsible: [Me]',
		'project: roommate',
		`role: ${role}`,
		`priority: ${priority}`,
		'---',
		'',
		'## Description',
	].join('\n');
}

describe('EisenhowerMatrixComposer', () => {
	it('gathers open Activities from the vault and renders the matrix', async () => {
		const app = makeApp({
			'Activities/a1.md': activityContent('doing', 'urgent-important', 'Engineer'),
			'Activities/a2.md': activityContent('done', 'urgent-important', 'Engineer'), // excluded: done
			'Activities/Archive/old.md': activityContent('doing', 'urgent-important'), // excluded: archived
		});
		const composer = new EisenhowerMatrixComposer(SETTINGS);

		const content = await composer.generate(app);

		expect(content).toContain('# Eisenhower Matrix');
		expect(content).toContain('[[Activities/a1\\|a1]]');
		expect(content).not.toContain('[[Activities/a2');
		expect(content).not.toContain('[[Activities/Archive/old');
	});

	// The matrix is a live view now: refresh() installs the code block that the
	// plugin renders buttons into, rather than baking in a static table.
	it('refresh() installs the live-view code block into an empty matrix file', async () => {
		const app = makeApp({
			'Activities/a1.md': activityContent('backlog', 'not-urgent-important'),
			'Dashboards/Eisenhower Matrix.md': '',
		});
		const composer = new EisenhowerMatrixComposer(SETTINGS);

		await composer.refresh(app, 'Dashboards/Eisenhower Matrix.md');

		const saved = app.vault.saves.get('Dashboards/Eisenhower Matrix.md');
		expect(saved).toContain('# Eisenhower Matrix');
		expect(saved).toContain('```' + MATRIX_CODE_BLOCK_LANG);
	});

	it('refresh() leaves a matrix note that already has the code block untouched', async () => {
		const existing = ['# Eisenhower Matrix', '', '```' + MATRIX_CODE_BLOCK_LANG, '```', ''].join('\n');
		const app = makeApp({
			'Activities/a1.md': activityContent('doing', 'urgent-important'),
			'Dashboards/Eisenhower Matrix.md': existing,
		});
		const composer = new EisenhowerMatrixComposer(SETTINGS);

		await composer.refresh(app, 'Dashboards/Eisenhower Matrix.md');

		expect(app.vault.saves.has('Dashboards/Eisenhower Matrix.md')).toBe(false);
	});
});
