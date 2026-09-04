import { ActivityComposer } from '../src/composers/ActivityComposer';
import { CONTACT_STATUS_FIELD } from '../src/components/ContactChecklist';

// Regression guard: the communication checklist stores a contact's status as a
// `contactStatus` frontmatter field on the People note, but ActivityComposer
// fully rewrites that frontmatter every time the note is opened. If extra-field
// preservation ever regresses, statuses would silently reset to "active".

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
	async modify(file: { path: string }, content: string) { this.saves.set(file.path, content); }
	async create(path: string, content: string) { return { path }; }
	async createFolder(_path: string) {}
	getFiles() {
		return [...this.files.keys()].map(p => ({
			path: p,
			name: p.split('/').pop()!,
			basename: p.split('/').pop()!.replace('.md', ''),
		}));
	}
}

const PERSON_PATH = 'People/Alice.md';

const settings = {
	journalFolder: 'Journal',
	projectsFolder: 'Projects',
	activitiesFolder: 'Activities',
	archiveFolder: 'Activities/Archive',
};

function personNote(status: string): string {
	return [
		'---',
		'startDate: 2026-01-01',
		'stage: doing',
		'responsible: [Me]',
		`${CONTACT_STATUS_FIELD}: ${status}`,
		'---',
		'',
		'## Journal',
		'',
		'[[2026-01-05]]',
		'- [ ] catch up with Alice',
		'',
		'----',
		'',
	].join('\n');
}

describe('contactStatus survives the People pipeline', () => {
	it.each(['active', 'inactive', 'archived'])('preserves status "%s"', async (status) => {
		const vault = new MockVault({
			[PERSON_PATH]: personNote(status),
			'Journal/2026-01-05.md': '- [ ] catch up with [[Alice]]',
		});
		const composer = new ActivityComposer(settings);

		await composer.processActivity({ vault } as never, { path: PERSON_PATH });

		const saved = vault.saves.get(PERSON_PATH);
		expect(saved).toBeDefined();
		expect(saved).toContain(`${CONTACT_STATUS_FIELD}: ${status}`);
	});

	it('does not invent a status for people that never had one', async () => {
		const withoutStatus = personNote('active')
			.split('\n')
			.filter(l => !l.startsWith(CONTACT_STATUS_FIELD))
			.join('\n');

		const vault = new MockVault({
			[PERSON_PATH]: withoutStatus,
			'Journal/2026-01-05.md': '- [ ] catch up with [[Alice]]',
		});

		await new ActivityComposer(settings).processActivity({ vault } as never, { path: PERSON_PATH });

		expect(vault.saves.get(PERSON_PATH)).not.toContain(CONTACT_STATUS_FIELD);
	});
});
