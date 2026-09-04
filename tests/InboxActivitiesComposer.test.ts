import { InboxActivitiesComposer } from '../src/composers/InboxActivitiesComposer';

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
};

function activityContent(project: string, stage: string, startDate = '2026-01-05', priority = ''): string {
	return [
		'---',
		`startDate: ${startDate}`,
		`stage: ${stage}`,
		'responsible: [Me]',
		`project: ${project}`,
		`priority: ${priority}`,
		'---',
		'',
		'## Description',
	].join('\n');
}

describe('InboxActivitiesComposer', () => {
	it('no-ops for a non-Inbox project file', async () => {
		const app = makeApp({
			'Activities/a1.md': activityContent('', 'doing'),
			'Projects/roommate.md': '---\nrole: Engineer\n---\n',
		});
		const composer = new InboxActivitiesComposer(SETTINGS);
		await composer.processProjectFile(app, 'Projects/roommate.md');
		expect(app.vault.saves.size).toBe(0);
	});

	it('no-ops for a nested non-Project.md file inside a project folder', async () => {
		const app = makeApp({
			'Projects/cognitive-pipeline/README.md': '# notes',
		});
		const composer = new InboxActivitiesComposer(SETTINGS);
		await composer.processProjectFile(app, 'Projects/cognitive-pipeline/README.md');
		expect(app.vault.saves.size).toBe(0);
	});

	it('replaces a legacy dataviewjs block in Inbox.md with a native activity table', async () => {
		const app = makeApp({
			'Activities/a1.md': activityContent('inbox', 'doing', '2026-01-10'),
			'Activities/a2.md': activityContent('', 'backlog', '2026-01-05'),
			'Activities/a3.md': activityContent('roommate', 'doing'), // different project — excluded
			'Activities/a4.md': activityContent('inbox', 'done'), // done — excluded
			'Projects/Inbox.md': [
				'---',
				'role: Selfcare',
				'---',
				'',
				'## Неорганизованные Activities',
				'',
				'```dataviewjs',
				'const pages = dv.pages();',
				'```',
			].join('\n'),
		});
		const composer = new InboxActivitiesComposer(SETTINGS);

		await composer.processProjectFile(app, 'Projects/Inbox.md');

		const saved = app.vault.saves.get('Projects/Inbox.md')!;
		expect(saved).not.toContain('dataviewjs');
		expect(saved).toContain('<!-- 2ndbrain:inbox-activities:start -->');
		expect(saved).toContain('[[Activities/a2\\|a2]]');
		expect(saved).toContain('[[Activities/a1\\|a1]]');
		expect(saved).not.toContain('a3');
		expect(saved).not.toContain('a4');
		// sorted by startDate ascending: a2 (01-05) before a1 (01-10)
		expect(saved.indexOf('a2')).toBeLessThan(saved.indexOf('a1'));
	});

	it('is idempotent: re-processing replaces only the marker block, not the whole file', async () => {
		const app = makeApp({
			'Activities/a1.md': activityContent('inbox', 'doing'),
			'Projects/Inbox.md': '---\nrole: Selfcare\n---\n\n## Intro\n\nSome hand-written notes.\n',
		});
		const composer = new InboxActivitiesComposer(SETTINGS);

		await composer.processProjectFile(app, 'Projects/Inbox.md');
		const first = app.vault.saves.get('Projects/Inbox.md')!;
		expect(first).toContain('Some hand-written notes.');
		expect(first).toContain('<!-- 2ndbrain:inbox-activities:start -->');

		await composer.processProjectFile(app, 'Projects/Inbox.md');
		const second = app.vault.saves.get('Projects/Inbox.md')!;
		expect(second).toBe(first); // no activities changed, no-op re-write is stable
	});

	it('shows the friendly empty-state message when nothing is unorganized', async () => {
		const app = makeApp({
			'Projects/Inbox.md': '---\nrole: Selfcare\n---\n',
		});
		const composer = new InboxActivitiesComposer(SETTINGS);

		await composer.processProjectFile(app, 'Projects/Inbox.md');

		const saved = app.vault.saves.get('Projects/Inbox.md')!;
		expect(saved).toContain('Все активные Activity приписаны к проектам.');
	});
});
