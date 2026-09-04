import {
	deriveTakeToWork,
	resolveTakeToWork,
	normalizeTakeToWorkDate,
	planDateHasArrived,
} from '../src/utilities/TakeToWork';

describe('deriveTakeToWork', () => {
	it('treats only a doing activity as planned', () => {
		expect(deriveTakeToWork('doing')).toBe(true);
		expect(deriveTakeToWork('backlog')).toBe(false);
		expect(deriveTakeToWork(null)).toBe(false);
	});
});

describe('resolveTakeToWork', () => {
	it('prefers an explicit value over the stage', () => {
		expect(resolveTakeToWork(false, 'doing')).toBe(false);
		expect(resolveTakeToWork(true, 'backlog')).toBe(true);
	});

	it('falls back to the stage when the field is absent', () => {
		expect(resolveTakeToWork(null, 'doing')).toBe(true);
		expect(resolveTakeToWork(undefined, 'backlog')).toBe(false);
	});
});

describe('normalizeTakeToWorkDate', () => {
	it('accepts a well-formed date and rejects anything else', () => {
		expect(normalizeTakeToWorkDate('2026-09-05')).toBe('2026-09-05');
		expect(normalizeTakeToWorkDate(' 2026-09-05 ')).toBe('2026-09-05');
		expect(normalizeTakeToWorkDate('next tuesday')).toBe('');
		expect(normalizeTakeToWorkDate(null)).toBe('');
	});
});

describe('planDateHasArrived', () => {
	const TODAY = '2026-09-05';

	it('fires on the planned day', () => {
		expect(planDateHasArrived('2026-09-05', TODAY)).toBe(true);
	});

	// A missed day must still fire, otherwise a plan silently evaporates.
	it('fires for a day that has already passed', () => {
		expect(planDateHasArrived('2026-08-01', TODAY)).toBe(true);
	});

	it('stays quiet for a future day', () => {
		expect(planDateHasArrived('2026-12-31', TODAY)).toBe(false);
	});

	it('stays quiet when there is no date, or it is unparseable', () => {
		expect(planDateHasArrived('', TODAY)).toBe(false);
		expect(planDateHasArrived(null, TODAY)).toBe(false);
		expect(planDateHasArrived('soon', TODAY)).toBe(false);
	});
});
