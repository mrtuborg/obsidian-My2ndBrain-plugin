import { ExternalWorkComposer } from '../src/composers/ExternalWorkComposer';
import { ActivityComposer } from '../src/composers/ActivityComposer';
import { ExternalWorkRequest } from '../src/components/ExternalWork';
import { extractRegion } from '../src/components/ManagedRegions';

class MockVault {
	files = new Map<string, string>();
	constructor(files: Record<string, string> = {}) { this.files = new Map(Object.entries(files)); }
	getAbstractFileByPath(path: string) { return this.files.has(path) ? this.f(path) : null; }
	private f(path: string) {
		const name = path.split('/').pop()!;
		return { path, name, basename: name.replace(/\.md$/, '') };
	}
	async read(file: { path: string }) { return this.files.get(file.path) ?? ''; }
	async modify(file: { path: string }, content: string) { this.files.set(file.path, content); }
	async create(path: string, content: string) { this.files.set(path, content); return this.f(path); }
	async createFolder(_p: string) {}
	getFiles() { return [...this.files.keys()].map(p => this.f(p)); }
	rename(from: string, to: string) {
		const c = this.files.get(from)!;
		this.files.delete(from);
		this.files.set(to, c);
	}
}

const SETTINGS = { journalFolder: 'Journal', activitiesFolder: 'Activities', archiveFolder: 'Activities/Archive' };
const PR = 'https://sensio.ghe.com/roommate/fw/pull/12';
const PR_FILES = 'https://Sensio.ghe.com/roommate/fw/pull/12/files?x=1';
const PR2 = 'https://sensio.ghe.com/roommate/fw/pull/13';
const DAY = '2026-01-05';
const ENG = `Journal/Contexts/${DAY}-Engineer.md`;
const TL = `Journal/Contexts/${DAY}-TechLead.md`;

function setup(files: Record<string, string> = {}) {
	const vault = new MockVault(files);
	const link = jest.fn(async () => {});
	const composer = new ExternalWorkComposer(SETTINGS, {
		dailyNotePathForDate: d => `Journal/${d}.md`,
		linkContext: link,
	});
	return { vault, app: { vault } as any, composer, link };
}

function req(over: Partial<ExternalWorkRequest> & { title?: string; sources?: any[] } = {}): ExternalWorkRequest {
	const { title, sources, ...rest } = over;
	return {
		date: DAY,
		kind: 'morning',
		activity: { title: title ?? 'Gateway firmware', sources: sources ?? [{ url: PR, title: 'Fix the long upstream title of the gateway' }] },
		summary: ['Waiting on review'],
		todos: [{ action: 'review' }],
		...rest,
	};
}

const activityPaths = (v: MockVault) => [...v.files.keys()].filter(p => p.startsWith('Activities/'));

describe('ensureContext', () => {
	it('creates a past-date page without a backlink when the daily note is missing', async () => {
		const { app, composer, vault } = setup();
		const r = await composer.ensureContext(app, DAY, 'Engineer');
		expect(r.status).toBe('created');
		expect(r.path).toBe(ENG);
		expect(vault.files.get(ENG)).toContain('## Activities');
		expect(vault.files.get(ENG)).not.toContain(`[[Journal/${DAY}`);
	});

	it('links an existing daily note and is idempotent', async () => {
		const { app, composer, link } = setup({ [`Journal/${DAY}.md`]: '# x' });
		expect((await composer.ensureContext(app, DAY, 'TechLead')).status).toBe('created');
		expect(link).toHaveBeenCalledWith(app, expect.objectContaining({ path: `Journal/${DAY}.md` }), 'TechLead', DAY);
		expect((await composer.ensureContext(app, DAY, 'TechLead')).status).toBe('exists');
	});

	it('refuses future dates, bad dates and unknown roles', async () => {
		const { app, composer } = setup();
		expect((await composer.ensureContext(app, '2999-01-01', 'Engineer')).status).toBe('error');
		expect((await composer.ensureContext(app, 'yesterday', 'Engineer')).status).toBe('error');
		expect((await composer.ensureContext(app, DAY, 'Wizard')).status).toBe('error');
	});
});

describe('upsertExternalWork', () => {
	it('creates an Activity with a numberless name, source area, and routes Engineer work to the Engineer Context', async () => {
		const { app, composer, vault } = setup();
		const [r] = await composer.upsertExternalWork(app, req());
		expect(r.status).toBe('created');
		expect(r.activityPath).toBe('Activities/Gateway firmware.md');
		expect(r.contextPath).toBe(ENG);
		const act = vault.files.get(r.activityPath!)!;
		expect(act).toContain('sourceUrls:');
		expect(act).toContain(PR);
		expect(act).toContain('Fix the long upstream title of the gateway');
		expect(act).toMatch(/takeToWork: true/);
		const page = vault.files.get(ENG)!;
		expect(page).toContain('##### [[Activities/Gateway firmware.md|Gateway firmware]]');
		expect(page).toContain('Review in «Gateway firmware»');
		expect(page.replace(/<!--.*?-->/g, '')).not.toMatch(/#12|\b12\b/);
		expect(vault.files.has(TL)).toBe(false);
	});

	it('routes board work to the TechLead Context', async () => {
		const { app, composer, vault } = setup();
		const [r] = await composer.upsertExternalWork(app, req({
			kind: 'board', title: 'Platform board health',
			sources: [{ url: 'https://github.com/orgs/o/projects/4', title: 'Board' }],
			todos: [{ action: 'custom', label: 'Assign owner to blocked work', key: 'owner-gap' }],
		}));
		expect(r.status).toBe('created');
		expect(r.contextPath).toBe(TL);
		expect(vault.files.get(TL)).toContain('Assign owner to blocked work');
		expect(vault.files.has(ENG)).toBe(false);
	});

	it('rejects a role/kind mismatch and numbers in titles', async () => {
		const { app, composer, vault } = setup();
		const [a] = await composer.upsertExternalWork(app, req({ role: 'TechLead' }));
		expect(a.status).toBe('error');
		expect(a.code).toBe('role-kind-mismatch');
		const [b] = await composer.upsertExternalWork(app, req({ title: 'Fix PR #12' }));
		expect(b.status).toBe('error');
		expect(vault.files.size).toBe(0);
	});

	it('reuses by URL after the user renames the Activity, and never renames it back', async () => {
		const { app, composer, vault } = setup();
		await composer.upsertExternalWork(app, req());
		vault.rename('Activities/Gateway firmware.md', 'Activities/My own name.md');
		const [r] = await composer.upsertExternalWork(app, req({
			title: 'Gateway firmware',
			sources: [{ url: PR_FILES, title: 'Upstream title changed completely' }],
		}));
		expect(r.status).toBe('updated');
		expect(r.activityPath).toBe('Activities/My own name.md');
		expect(activityPaths(vault)).toEqual(['Activities/My own name.md']);
		const act = vault.files.get('Activities/My own name.md')!;
		expect(act).toContain('Upstream title changed completely');
		expect(act).not.toContain('Fix the long upstream title');
		expect(act.match(/sourceUrls:/g)).toHaveLength(1);
	});

	it('supports several sources on one Activity', async () => {
		const { app, composer, vault } = setup();
		await composer.upsertExternalWork(app, req());
		const [r] = await composer.upsertExternalWork(app, req({
			sources: [{ url: PR, title: 'A' }, { url: PR2, title: 'B' }],
		}));
		expect(r.status).toBe('updated');
		const act = vault.files.get('Activities/Gateway firmware.md')!;
		expect(act).toContain(PR);
		expect(act).toContain(PR2);
		expect(activityPaths(vault)).toHaveLength(1);
	});

	it('reports a duplicate URL owner conflict without writing', async () => {
		const owner = (n: string) => `---\nstage: doing\nsourceUrls:\n  - ${PR}\n---\n\n## Description\n\n----\n## Journal\n`;
		const { app, composer, vault } = setup({
			'Activities/One.md': owner('1'),
			'Activities/Two.md': owner('2'),
		});
		const before = new Map(vault.files);
		const [r] = await composer.upsertExternalWork(app, req());
		expect(r.status).toBe('conflict');
		expect(r.conflicts![0].owners.sort()).toEqual(['Activities/One.md', 'Activities/Two.md']);
		expect(vault.files).toEqual(before);
		expect(await composer.reportSourceConflicts(app)).toHaveLength(1);
	});

	it('disambiguates a title collision semantically and never with a number', async () => {
		const { app, composer, vault } = setup();
		await composer.upsertExternalWork(app, req());
		const [r] = await composer.upsertExternalWork(app, req({
			sources: [{ url: 'https://sensio.ghe.com/roommate/other/pull/99', title: 'x' }],
		}));
		expect(r.status).toBe('created');
		expect(r.activityPath).toBe('Activities/Gateway firmware (other).md');
		const [q] = await composer.upsertExternalWork(app, req({
			activity: undefined as any,
		}).activity ? req() : req({
			sources: [{ url: 'https://sensio.ghe.com/roommate/zzz/pull/5', title: 'x' }],
			title: 'Gateway firmware',
		}));
		expect(q.activityPath).toBe('Activities/Gateway firmware (zzz).md');
		expect(activityPaths(vault).some(p => /\d/.test(p))).toBe(false);
	});

	it('errors with name-collision when no semantic qualifier is free', async () => {
		const { app, composer } = setup({
			'Activities/Gateway firmware.md': '---\nstage: doing\n---\n',
			'Activities/Gateway firmware (fw).md': '---\nstage: doing\n---\n',
		});
		const [r] = await composer.upsertExternalWork(app, req());
		expect(r.status).toBe('error');
		expect(r.code).toBe('name-collision');
	});

	it('replaces morning and evening regions independently and preserves checkbox + user content', async () => {
		const { app, composer, vault } = setup();
		await composer.upsertExternalWork(app, req());
		let page = vault.files.get(ENG)!;
		page = page
			.replace('- [ ] Review in', '- [x] Review in')
			.replace('----\n', '- [ ] my own todo\nmy own note\n----\n');
		vault.files.set(ENG, page);

		await composer.upsertExternalWork(app, req({
			kind: 'evening', summary: ['Reviewed, two comments left'], todos: [{ action: 'address-feedback' }],
		}));
		await composer.upsertExternalWork(app, req({ summary: ['Fresh morning snapshot'] }));

		page = vault.files.get(ENG)!;
		expect(page).toContain('Fresh morning snapshot');
		expect(page).not.toContain('Waiting on review');
		expect(page).toContain('Reviewed, two comments left');
		expect(page).toContain('- [x] Review in «Gateway firmware»');
		expect(page).toContain('Address feedback in «Gateway firmware»');
		expect(page).toContain('- [ ] my own todo');
		expect(page).toContain('my own note');
		expect(page.match(/Review in «/g)).toHaveLength(1);
		expect(page.match(/##### \[\[/g)).toHaveLength(1);
		expect(extractRegion(page.split('\n'), 'evening').join('\n')).toContain('Reviewed');
	});

	it('keeps todo state and wording follows a rename', async () => {
		const { app, composer, vault } = setup();
		await composer.upsertExternalWork(app, req());
		vault.files.set(ENG, vault.files.get(ENG)!.replace('- [ ] Review in', '- [x] Review in'));
		vault.rename('Activities/Gateway firmware.md', 'Activities/Edge gateway.md');
		await composer.upsertExternalWork(app, req());
		const page = vault.files.get(ENG)!;
		expect(page).toContain('- [x] Review in «Edge gateway»');
		expect(page).not.toContain('«Gateway firmware»');
	});

	it('does not create or revive for evening unless asked, and skips archived owners', async () => {
		const { app, composer, vault } = setup();
		const [e] = await composer.upsertExternalWork(app, req({ kind: 'evening' }));
		expect(e.status).toBe('skipped');
		expect(activityPaths(vault)).toHaveLength(0);

		const arch = setup({
			'Activities/Archive/Old.md': `---\nstage: done\nsourceUrls:\n  - ${PR}\n---\n`,
		});
		const [a] = await arch.composer.upsertExternalWork(arch.app, req());
		expect(a.status).toBe('skipped');
		expect(a.code).toBe('archived-activity');
	});

	it('keeps the source area when ActivityComposer rebuilds the Activity', async () => {
		const { app, composer, vault } = setup();
		const [r] = await composer.upsertExternalWork(app, req());
		const before = vault.files.get(r.activityPath!)!;
		const file = vault.getAbstractFileByPath(r.activityPath!)!;
		const ac = new ActivityComposer({
			journalFolder: 'Journal', projectsFolder: 'Projects',
			activitiesFolder: 'Activities', archiveFolder: 'Activities/Archive',
		} as any);
		await ac.processActivity(app, file as any);
		const after = vault.files.get(r.activityPath!)!;
		expect(after).toContain('2ndbrain:sources:start');
		expect(after).toContain(PR);
		expect(after).toContain(`sourceUrls:`);
		expect(before.includes('Fix the long upstream title')).toBe(true);
		expect(after).toContain('Fix the long upstream title');
	});
});
