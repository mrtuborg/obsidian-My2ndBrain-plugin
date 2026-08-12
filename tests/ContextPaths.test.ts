import { dirOf, contextsFolderForNote, matchContextPagePath } from '../src/utilities/ContextPaths';

const ROLES = ['Family', 'Engineer', 'TechLead', 'Entrepreneur', 'Selfcare'] as const;

describe('dirOf', () => {
	it('returns the parent directory of a nested path', () => {
		expect(dirOf('Journal/2026/08.August/2026-08-12.md')).toBe('Journal/2026/08.August');
	});

	it('returns the parent directory of a shallow path', () => {
		expect(dirOf('Journal/2026-08-12.md')).toBe('Journal');
	});

	it('returns an empty string for a root-level path', () => {
		expect(dirOf('2026-08-12.md')).toBe('');
	});
});

describe('contextsFolderForNote', () => {
	it('sits alongside a flat daily note', () => {
		expect(contextsFolderForNote('Journal/2026-08-12.md')).toBe('Journal/Contexts');
	});

	it('sits alongside a deeply nested daily note (dated Daily Notes folder format)', () => {
		expect(contextsFolderForNote('Journal/2026/08.August/2026-08-12.md'))
			.toBe('Journal/2026/08.August/Contexts');
	});

	it('falls back to a root "Contexts" folder for a root-level note', () => {
		expect(contextsFolderForNote('2026-08-12.md')).toBe('Contexts');
	});
});

describe('matchContextPagePath', () => {
	it('matches a context page nested directly under the journal folder', () => {
		expect(matchContextPagePath('Journal/Contexts/Engineer/2026-08-12.md', 'Journal', ROLES))
			.toBe('Engineer');
	});

	it('matches a context page nested under a dated Daily Notes folder format', () => {
		expect(matchContextPagePath(
			'Journal/2026/08.August/Contexts/TechLead/2026-08-12.md', 'Journal', ROLES
		)).toBe('TechLead');
	});

	it('returns null for a real daily note (no Contexts segment)', () => {
		expect(matchContextPagePath('Journal/2026/08.August/2026-08-12.md', 'Journal', ROLES))
			.toBeNull();
	});

	it('returns null when the folder before the role is not "Contexts"', () => {
		expect(matchContextPagePath('Journal/Other/Engineer/2026-08-12.md', 'Journal', ROLES))
			.toBeNull();
	});

	it('returns null when the folder name is not a known role', () => {
		expect(matchContextPagePath('Journal/Contexts/NotARole/2026-08-12.md', 'Journal', ROLES))
			.toBeNull();
	});

	it('returns null for a malformed date filename', () => {
		expect(matchContextPagePath('Journal/Contexts/Engineer/not-a-date.md', 'Journal', ROLES))
			.toBeNull();
	});

	it('returns null for paths outside the journal folder', () => {
		expect(matchContextPagePath('Activities/Contexts/Engineer/2026-08-12.md', 'Journal', ROLES))
			.toBeNull();
	});
});
