import { EisenhowerMatrix, MatrixActivity } from '../src/components/EisenhowerMatrix';

function activity(overrides: Partial<MatrixActivity> = {}): MatrixActivity {
	return {
		path: 'Activities/a.md',
		displayName: 'a',
		project: '',
		role: '',
		stage: 'doing',
		startDate: '2026-01-01',
		priority: '',
		...overrides,
	};
}

describe('EisenhowerMatrix.buildQuadrants', () => {
	it('buckets open activities into the four canonical quadrants', () => {
		const matrix = new EisenhowerMatrix();
		const activities = [
			activity({ path: 'Activities/a1.md', priority: 'urgent-important' }),
			activity({ path: 'Activities/a2.md', priority: 'not-urgent-important' }),
			activity({ path: 'Activities/a3.md', priority: 'urgent-not-important' }),
			activity({ path: 'Activities/a4.md', priority: 'not-urgent-not-important' }),
		];

		const quadrants = matrix.buildQuadrants(activities);

		expect(quadrants).toHaveLength(4);
		expect(quadrants.map(q => q.key)).toEqual([
			'urgent-important',
			'not-urgent-important',
			'urgent-not-important',
			'not-urgent-not-important',
		]);
		for (const q of quadrants) expect(q.activities).toHaveLength(1);
	});

	it('excludes done activities', () => {
		const matrix = new EisenhowerMatrix();
		const activities = [
			activity({ path: 'Activities/a1.md', priority: 'urgent-important', stage: 'done' }),
			activity({ path: 'Activities/a2.md', priority: 'urgent-important', stage: 'doing' }),
		];

		const quadrants = matrix.buildQuadrants(activities);
		const urgentImportant = quadrants.find(q => q.key === 'urgent-important')!;

		expect(urgentImportant.activities).toHaveLength(1);
		expect(urgentImportant.activities[0].path).toBe('Activities/a2.md');
	});

	it('adds a 5th "other" bucket only when unprioritized activities exist', () => {
		const matrix = new EisenhowerMatrix();

		const withoutOther = matrix.buildQuadrants([activity({ priority: 'urgent-important' })]);
		expect(withoutOther.find(q => q.key === 'other')).toBeUndefined();

		const withOther = matrix.buildQuadrants([
			activity({ priority: 'urgent-important' }),
			activity({ path: 'Activities/a2.md', priority: '' }),
			activity({ path: 'Activities/a3.md', priority: 'bogus' }),
		]);
		const other = withOther.find(q => q.key === 'other');
		expect(other).toBeDefined();
		expect(other!.activities).toHaveLength(2);
	});

	it('sorts within a quadrant by role then start date then name', () => {
		const matrix = new EisenhowerMatrix();
		const activities = [
			activity({ path: 'Activities/a1.md', priority: 'urgent-important', role: 'Engineer', startDate: '2026-01-10' }),
			activity({ path: 'Activities/a2.md', priority: 'urgent-important', role: 'Engineer', startDate: '2026-01-05' }),
			activity({ path: 'Activities/a3.md', priority: 'urgent-important', role: 'Family', startDate: '2026-01-01' }),
		];

		const quadrants = matrix.buildQuadrants(activities);
		const order = quadrants[0].activities.map(a => a.path);

		expect(order).toEqual(['Activities/a2.md', 'Activities/a1.md', 'Activities/a3.md']);
	});
});

describe('EisenhowerMatrix.render', () => {
	it('renders a heading per quadrant with a table of activities', () => {
		const matrix = new EisenhowerMatrix();
		const quadrants = matrix.buildQuadrants([
			activity({ path: 'Activities/a1.md', displayName: 'Fix roof', priority: 'urgent-important', role: 'Family', project: 'house' }),
		]);

		const output = matrix.render(quadrants, '2026-01-15');

		expect(output).toContain('# Eisenhower Matrix');
		expect(output).toContain('🔥 Urgent & important');
		expect(output).toContain('[[Activities/a1\\|Fix roof]]');
		expect(output).toContain('Family');
		expect(output).toContain('house');
	});

	it('shows an empty-state message when there are no open activities', () => {
		const matrix = new EisenhowerMatrix();
		const output = matrix.render(matrix.buildQuadrants([]), '2026-01-15');

		expect(output).toContain('No open activities found');
	});
});
