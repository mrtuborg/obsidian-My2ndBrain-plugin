import {
	PeopleDashboard, PersonPage, AGING_DAYS, QUIET_DAYS,
	PERSON_HEALTH_LABEL,
} from '../src/components/PeopleDashboard';
import { Commitment, UNASSIGNED } from '../src/components/Commitments';

const TODAY = '2026-09-01';
const dash = new PeopleDashboard();

function commitment(over: Partial<Commitment> = {}): Commitment {
	return {
		direction: 'owed',
		text: 'Send the BOM',
		person: 'Ida Haugland',
		activity: '',
		born: TODAY,
		done: null,
		path: 'Journal/2026-09-01.md',
		raw: '- [ ] Send the BOM @owed [[Ida Haugland]]',
		...over,
	};
}

function page(name: string, archived = false): PersonPage {
	return {
		name,
		path: archived ? `People/Archive/${name}.md` : `People/${name}.md`,
		archived,
	};
}

function build(
	commitments: Commitment[],
	lastSeen: Array<[string, string]> = [],
	pages: PersonPage[] = []
) {
	return dash.buildRows({ commitments, lastSeen: new Map(lastSeen), pages, today: TODAY });
}

describe('buildRows', () => {
	it('gives everyone with a page a row, even with nothing outstanding', () => {
		const rows = build([], [], [page('Ida Haugland'), page('Frederik Stray')]);
		expect(rows.map(r => r.name).sort()).toEqual(['Frederik Stray', 'Ida Haugland']);
	});

	it('counts the two directions separately', () => {
		const rows = build([
			commitment({ direction: 'owed', text: 'A' }),
			commitment({ direction: 'owed', text: 'B' }),
			commitment({ direction: 'waiting', text: 'C' }),
		], [], [page('Ida Haugland')]);
		expect(rows[0]!.owed).toBe(2);
		expect(rows[0]!.waiting).toBe(1);
		expect(rows[0]!.open).toBe(3);
	});

	it('does not count a kept promise as open', () => {
		const rows = build([
			commitment({ text: 'A', done: TODAY }),
			commitment({ text: 'B' }),
		], [], [page('Ida Haugland')]);
		expect(rows[0]!.open).toBe(1);
		expect(rows[0]!.done).toBe(1);
	});

	it('ages an open promise from its birthday', () => {
		const rows = build([commitment({ born: '2026-08-18' })], [], [page('Ida Haugland')]);
		expect(rows[0]!.commitments[0]!.age).toBe(14);
		expect(rows[0]!.oldestOpen).toBe(14);
	});

	it('does not age a kept promise', () => {
		const rows = build(
			[commitment({ born: '2026-01-01', done: '2026-01-02' })], [], [page('Ida Haugland')]
		);
		expect(rows[0]!.commitments[0]!.age).toBe(0);
		expect(rows[0]!.oldestOpen).toBe(0);
	});

	it('reads open promises before kept ones, oldest first', () => {
		const rows = build([
			commitment({ text: 'Done one', born: '2026-01-01', done: '2026-01-02' }),
			commitment({ text: 'Newer', born: '2026-08-30' }),
			commitment({ text: 'Older', born: '2026-08-01' }),
		], [], [page('Ida Haugland')]);
		expect(rows[0]!.commitments.map(c => c.text)).toEqual(['Older', 'Newer', 'Done one']);
	});
});

describe('health', () => {
	it('calls a person aging when something passed the threshold', () => {
		const born = '2026-08-18'; // exactly AGING_DAYS before TODAY
		const rows = build([commitment({ born })], [], [page('Ida Haugland')]);
		expect(rows[0]!.commitments[0]!.age).toBe(AGING_DAYS);
		expect(rows[0]!.health).toBe('aging');
	});

	it('calls a fresh promise open, not aging', () => {
		const rows = build([commitment({ born: '2026-08-30' })], [], [page('Ida Haugland')]);
		expect(rows[0]!.health).toBe('open');
	});

	it('calls someone quiet after the quiet threshold', () => {
		const rows = build([], [['Ida Haugland', '2026-06-01']], [page('Ida Haugland')]);
		expect(rows[0]!.daysSinceSeen).toBeGreaterThanOrEqual(QUIET_DAYS);
		expect(rows[0]!.health).toBe('quiet');
	});

	it('never calls an archived person quiet', () => {
		const rows = build([], [['Tuva Moxnes', '2024-09-30']], [page('Tuva Moxnes', true)]);
		expect(rows[0]!.health).toBe('clear');
	});

	it('prefers aging over quiet when both apply', () => {
		const rows = build(
			[commitment({ person: 'Ida Haugland', born: '2026-06-01' })],
			[['Ida Haugland', '2026-06-01']],
			[page('Ida Haugland')]
		);
		expect(rows[0]!.health).toBe('aging');
	});

	it('calls someone clear when nothing is outstanding and they were seen recently', () => {
		const rows = build([], [['Ida Haugland', '2026-08-30']], [page('Ida Haugland')]);
		expect(rows[0]!.health).toBe('clear');
	});

	it('does not call a never-mentioned page quiet', () => {
		const rows = build([], [], [page('Ida Haugland')]);
		expect(rows[0]!.daysSinceSeen).toBeNull();
		expect(rows[0]!.health).toBe('clear');
	});
});

describe('sorting', () => {
	it('puts who needs attention first and who needs nothing last', () => {
		const rows = build([
			commitment({ person: 'Aging Person', born: '2026-07-01' }),
			commitment({ person: 'Open Person', born: '2026-08-30' }),
		], [
			['Aging Person', '2026-07-01'],
			['Open Person', '2026-08-30'],
			['Quiet Person', '2026-05-01'],
			['Clear Person', '2026-08-31'],
		], [
			page('Aging Person'), page('Open Person'), page('Quiet Person'), page('Clear Person'),
		]);
		expect(rows.map(r => r.name)).toEqual([
			'Aging Person', 'Open Person', 'Quiet Person', 'Clear Person',
		]);
	});

	it('breaks a tie by the oldest open promise', () => {
		const rows = build([
			commitment({ person: 'Newer', born: '2026-07-01' }),
			commitment({ person: 'Older', born: '2026-06-01' }),
		], [], [page('Newer'), page('Older')]);
		expect(rows.map(r => r.name)).toEqual(['Older', 'Newer']);
	});
});

describe('pages', () => {
	it('flags a person the journal names but has no page for', () => {
		const rows = build([commitment({ person: 'Brand New' })], [['Brand New', TODAY]], []);
		expect(rows[0]!.missingPage).toBe(true);
		expect(rows[0]!.path).toBeNull();
	});

	it('does not flag someone who has a page', () => {
		const rows = build([commitment()], [], [page('Ida Haugland')]);
		expect(rows[0]!.missingPage).toBe(false);
		expect(rows[0]!.path).toBe('People/Ida Haugland.md');
	});

	it('matches a page to a differently cased mention', () => {
		const rows = build([commitment({ person: 'ida haugland' })], [], [page('Ida Haugland')]);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.missingPage).toBe(false);
	});
});

describe('the unassigned bucket', () => {
	it('keeps unaddressed promises rather than dropping them', () => {
		const rows = build([commitment({ person: UNASSIGNED })]);
		expect(rows[0]!.name).toBe(UNASSIGNED);
		expect(rows[0]!.open).toBe(1);
	});

	it('never asks you to create a page for it', () => {
		const rows = build([commitment({ person: UNASSIGNED })]);
		expect(rows[0]!.missingPage).toBe(false);
	});

	it('never calls it quiet', () => {
		const rows = build([], [[UNASSIGNED, '2026-01-01']]);
		expect(rows[0]!.health).toBe('clear');
	});

	it('still ages what is in it', () => {
		const rows = build([commitment({ person: UNASSIGNED, born: '2026-06-01' })]);
		expect(rows[0]!.health).toBe('aging');
	});
});

describe('summarize', () => {
	it('totals both directions and the aging count', () => {
		const rows = build([
			commitment({ person: 'A', direction: 'owed', born: '2026-06-01' }),
			commitment({ person: 'A', direction: 'waiting', text: 'X' }),
			commitment({ person: 'B', direction: 'owed', text: 'Y' }),
		], [], [page('A'), page('B')]);

		const s = dash.summarize(rows);
		expect(s.owed).toBe(2);
		expect(s.waiting).toBe(1);
		expect(s.aging).toBe(1);
		expect(s.people).toBe(2);
	});

	it('excludes the unassigned bucket from the people count', () => {
		const rows = build([commitment({ person: UNASSIGNED })], [], [page('A')]);
		expect(dash.summarize(rows).people).toBe(1);
	});

	it('counts quiet people and missing pages', () => {
		const rows = build(
			[commitment({ person: 'Nobody' })],
			[['Quiet One', '2026-01-01'], ['Nobody', TODAY]],
			[page('Quiet One')]
		);
		const s = dash.summarize(rows);
		expect(s.quiet).toBe(1);
		expect(s.missingPages).toBe(1);
	});

	it('reports zeroes for an empty vault rather than throwing', () => {
		const s = dash.summarize(build([]));
		expect(s).toEqual({ owed: 0, waiting: 0, aging: 0, people: 0, quiet: 0, missingPages: 0 });
	});
});

describe('labels', () => {
	it('names every health state', () => {
		expect(Object.keys(PERSON_HEALTH_LABEL).sort()).toEqual(
			['aging', 'clear', 'open', 'quiet']
		);
	});
});
