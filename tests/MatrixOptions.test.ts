import {
	stageOptions,
	roleOptions,
	priorityOptions,
	projectOptions,
	collectProjectNames,
} from '../src/utilities/MatrixOptions';

const values = (opts: { value: string }[]) => opts.map(o => o.value);

describe('MatrixOptions', () => {
	it('offers a blank first so any field can be cleared', () => {
		expect(values(stageOptions('doing'))[0]).toBe('');
		expect(values(roleOptions('Engineer'))[0]).toBe('');
		expect(values(priorityOptions(''))[0]).toBe('');
		expect(values(projectOptions(['a'], ''))[0]).toBe('');
	});

	it('offers the three real stages', () => {
		expect(values(stageOptions('doing'))).toEqual(['', 'doing', 'backlog', 'done']);
	});

	it('offers every configured role and every quadrant priority', () => {
		expect(values(roleOptions(''))).toEqual(
			['', 'Family', 'Engineer', 'TechLead', 'Entrepreneur', 'Selfcare']
		);
		expect(values(priorityOptions(''))).toEqual([
			'',
			'urgent-important',
			'not-urgent-important',
			'urgent-not-important',
			'not-urgent-not-important',
		]);
	});

	// A dropdown that silently omits the value on disk would rewrite that field
	// the moment the user touched any other column in the row.
	describe('preserving unknown values already on disk', () => {
		it('keeps a retired role and marks it unknown', () => {
			const opts = roleOptions('Gardener');
			expect(values(opts)).toContain('Gardener');
			expect(opts.find(o => o.value === 'Gardener')!.label).toBe('Gardener (unknown)');
		});

		it('keeps a hand-typed stage and priority', () => {
			expect(values(stageOptions('paused'))).toContain('paused');
			expect(values(priorityOptions('someday'))).toContain('someday');
		});

		it('does not duplicate a value that is already known', () => {
			expect(values(stageOptions('done')).filter(v => v === 'done')).toHaveLength(1);
		});

		it('treats blank and whitespace as "no value", not as an unknown option', () => {
			// Only the leading clear-the-field entry is blank; whitespace must
			// not append a second, invisible option beside it.
			expect(values(roleOptions('')).filter(v => v === '')).toHaveLength(1);
			expect(values(roleOptions('   '))).toEqual(values(roleOptions('')));
		});
	});

	describe('collectProjectNames', () => {
		const paths = [
			'Projects/roommate/README.md',
			'Projects/roommate/notes/deep.md',
			'Projects/cognitive-pipeline/index.md',
			'Projects/standalone.md',
			'Activities/something.md',
			'Journal/2026-01-01.md',
		];

		it('finds both folder projects and bare note projects', () => {
			expect(collectProjectNames(paths, 'Projects', [])).toEqual(
				['cognitive-pipeline', 'roommate', 'standalone']
			);
		});

		it('ignores anything outside the projects folder', () => {
			const names = collectProjectNames(paths, 'Projects', []);
			expect(names).not.toContain('something');
			expect(names).not.toContain('2026-01-01');
		});

		it('includes projects an activity references but the scan cannot see', () => {
			expect(collectProjectNames(paths, 'Projects', ['inbox', 'life-50']))
				.toEqual(['cognitive-pipeline', 'inbox', 'life-50', 'roommate', 'standalone']);
		});

		it('deduplicates and drops blanks', () => {
			expect(collectProjectNames(paths, 'Projects', ['roommate', '', '  ']))
				.toEqual(['cognitive-pipeline', 'roommate', 'standalone']);
		});
	});
});
