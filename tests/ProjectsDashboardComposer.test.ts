import { ProjectsDashboardComposer } from '../src/composers/ProjectsDashboardComposer';

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
	projectsFolder: 'Projects',
	dashboardPath: 'Projects/Dashboard.md',
};

function activityContent(project: string, stage: string, role = ''): string {
	return [
		'---',
		'startDate: 2026-01-05',
		`stage: ${stage}`,
		'responsible: [Me]',
		`project: ${project}`,
		`role: ${role}`,
		'---',
		'',
		'## Description',
	].join('\n');
}

describe('ProjectsDashboardComposer', () => {
	it('gathers Activities and Projects from the vault and renders a dashboard', async () => {
		const app = makeApp({
			'Activities/a1.md': activityContent('roommate', 'done', 'Engineer'),
			'Activities/a2.md': activityContent('roommate', 'doing', 'Engineer'),
			'Activities/Archive/old.md': activityContent('roommate', 'doing'), // excluded: archived
			'Projects/roommate.md': '---\nrole: Engineer\n---\n',
			'Projects/Dashboard.md': '', // must not be treated as its own project
		});
		const composer = new ProjectsDashboardComposer(SETTINGS);

		const content = await composer.generate(app);

		expect(content).toContain('## Engineer');
		expect(content).toContain('[[Projects/roommate\\|roommate]]');
		expect(content).toContain('1/2 (50%)');
		expect(content).not.toContain('[[Projects/Dashboard');
	});

	it('resolves projects living as Projects/<slug>/Project.md', async () => {
		const app = makeApp({
			'Activities/a1.md': activityContent('cognitive-pipeline', 'backlog', 'TechLead'),
			'Projects/cognitive-pipeline/Project.md': '---\nrole: TechLead\n---\n',
			'Projects/cognitive-pipeline/README.md': '# notes', // must not become its own project row
		});
		const composer = new ProjectsDashboardComposer(SETTINGS);

		const content = await composer.generate(app);

		expect(content).toContain('[[Projects/cognitive-pipeline/Project\\|cognitive-pipeline]]');
		expect((content.match(/\| \[\[/g) ?? []).length).toBe(1);
	});

	it('refresh() writes the generated content back into the dashboard file', async () => {
		const app = makeApp({
			'Activities/a1.md': activityContent('inbox', 'doing'),
			'Projects/Inbox.md': '---\nrole: Selfcare\n---\n',
			'Projects/Dashboard.md': '',
		});
		const composer = new ProjectsDashboardComposer(SETTINGS);

		await composer.refresh(app, 'Projects/Dashboard.md');

		const saved = app.vault.saves.get('Projects/Dashboard.md');
		expect(saved).toContain('# Projects Dashboard');
		expect(saved).toContain('## Selfcare');
		expect(saved).toContain('[[Projects/Inbox\\|Inbox]]');
	});
});
