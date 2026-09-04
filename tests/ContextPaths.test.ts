import {
	dirOf,
	contextsFolderForNote,
	contextPagePath,
	parseContextPageFilename,
	matchContextPagePath,
} from '../src/utilities/ContextPaths';

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

describe('contextPagePath', () => {
	it('builds a flat "date-role" filename inside the Contexts folder', () => {
		expect(contextPagePath('Journal/Contexts', '2026-08-12', 'Engineer'))
			.toBe('Journal/Contexts/2026-08-12-Engineer.md');
	});
});

describe('parseContextPageFilename', () => {
	it('parses a valid "date-role" filename', () => {
		expect(parseContextPageFilename('2026-08-12-Engineer.md', ROLES))
			.toEqual({ date: '2026-08-12', role: 'Engineer' });
	});

	it('returns null for a bare date filename (no role)', () => {
		expect(parseContextPageFilename('2026-08-12.md', ROLES)).toBeNull();
	});

	it('returns null when the role is unrecognized', () => {
		expect(parseContextPageFilename('2026-08-12-NotARole.md', ROLES)).toBeNull();
	});

	it('returns null for a malformed date', () => {
		expect(parseContextPageFilename('not-a-date-Engineer.md', ROLES)).toBeNull();
	});
});

describe('matchContextPagePath', () => {
	it('matches a context page nested directly under the journal folder', () => {
		expect(matchContextPagePath('Journal/Contexts/2026-08-12-Engineer.md', 'Journal', ROLES))
			.toBe('Engineer');
	});

	it('matches a context page nested under a dated Daily Notes folder format', () => {
		expect(matchContextPagePath(
			'Journal/2026/08.August/Contexts/2026-08-12-TechLead.md', 'Journal', ROLES
		)).toBe('TechLead');
	});

	it('returns null for a real daily note (no Contexts segment)', () => {
		expect(matchContextPagePath('Journal/2026/08.August/2026-08-12.md', 'Journal', ROLES))
			.toBeNull();
	});

	it('returns null when the folder before the filename is not "Contexts"', () => {
		expect(matchContextPagePath('Journal/Other/2026-08-12-Engineer.md', 'Journal', ROLES))
			.toBeNull();
	});

	it('returns null when the role suffix is not a known role', () => {
		expect(matchContextPagePath('Journal/Contexts/2026-08-12-NotARole.md', 'Journal', ROLES))
			.toBeNull();
	});

	it('returns null for a malformed date filename', () => {
		expect(matchContextPagePath('Journal/Contexts/not-a-date-Engineer.md', 'Journal', ROLES))
			.toBeNull();
	});

	it('returns null for a bare date filename (no role suffix)', () => {
		expect(matchContextPagePath('Journal/Contexts/2026-08-12.md', 'Journal', ROLES))
			.toBeNull();
	});

	it('returns null for paths outside the journal folder', () => {
		expect(matchContextPagePath('Activities/Contexts/2026-08-12-Engineer.md', 'Journal', ROLES))
			.toBeNull();
	});
});
