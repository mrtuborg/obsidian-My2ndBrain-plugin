import {
	parseSightings, foldCommitments, ageOf, daysBetween,
	UNASSIGNED, DIRECTION_LABEL, JournalSource, looksLikePerson, personFrom,
} from '../src/components/Commitments';

const KNOWN = new Set(['ida haugland', 'frederik stray', 'andre kleven', 'tuva moxnes']);

function source(text: string, date = '2026-09-01', path = 'Journal/2026/09.September/2026-09-01.md'): JournalSource {
	return { path, date, text };
}

describe('parseSightings', () => {
	it('reads both directions off a todo line', () => {
		const got = parseSightings(source([
			'- [ ] Send the BOM @owed [[Ida Haugland]]',
			'- [ ] Radio spec @waiting [[Frederik Stray]]',
		].join('\n')), KNOWN);

		expect(got.map(s => s.direction)).toEqual(['owed', 'waiting']);
		expect(got[0]!.people).toEqual(['Ida Haugland']);
		expect(got[1]!.people).toEqual(['Frederik Stray']);
	});

	it('ignores todo lines with no tag', () => {
		const got = parseSightings(source('- [ ] Just a normal task [[Ida Haugland]]'), KNOWN);
		expect(got).toEqual([]);
	});

	it('ignores a tag outside a todo line', () => {
		const got = parseSightings(source('Some prose @owed [[Ida Haugland]]'), KNOWN);
		expect(got).toEqual([]);
	});

	it('strips the tag and links so the text is just the promise', () => {
		const [s] = parseSightings(source('- [ ] Send the BOM @owed [[Ida Haugland]]'), KNOWN);
		expect(s!.text).toBe('Send the BOM Ida Haugland');
	});

	it('reads the same promise identically whatever the tag order', () => {
		const a = parseSightings(source('- [ ] Send BOM @owed [[Ida Haugland]]'), KNOWN)[0]!;
		const b = parseSightings(source('- [ ] Send BOM [[Ida Haugland]] @owed'), KNOWN)[0]!;
		expect(a.text).toBe(b.text);
	});

	it('resolves bare, People/-prefixed and archived links to the same person', () => {
		const got = parseSightings(source([
			'- [ ] One @owed [[Frederik Stray]]',
			'- [ ] Two @owed [[People/Frederik Stray]]',
			'- [ ] Three @owed [[People/Archive/Frederik Stray]]',
		].join('\n')), KNOWN);
		expect(got.map(s => s.people)).toEqual([
			['Frederik Stray'], ['Frederik Stray'], ['Frederik Stray'],
		]);
	});

	it('treats a People/ link as a person even when the name is unknown', () => {
		const [s] = parseSightings(source('- [ ] Ask @waiting [[People/Brand New]]'), KNOWN);
		expect(s!.people).toEqual(['Brand New']);
	});

	it('does not mistake a non-person wikilink for a person', () => {
		const [s] = parseSightings(source('- [ ] Read @owed [[AT Commands]]'), KNOWN);
		expect(s!.people).toEqual([]);
	});

	it('inherits the person from an enclosing heading', () => {
		const got = parseSightings(source([
			'### Infrastructure planning [[Andre Kleven]] [[Frederik Stray]]',
			'- [ ] Order the switch @owed',
		].join('\n')), KNOWN);
		expect(got[0]!.people).toEqual(['Andre Kleven', 'Frederik Stray']);
	});

	it('prefers the person on the line over the one on the heading', () => {
		const got = parseSightings(source([
			'### Planning [[Andre Kleven]]',
			'- [ ] Order the switch @owed [[Ida Haugland]]',
		].join('\n')), KNOWN);
		expect(got[0]!.people).toEqual(['Ida Haugland']);
	});

	it('stops a heading person leaking into a later unrelated section', () => {
		const got = parseSightings(source([
			'### Planning [[Andre Kleven]]',
			'- [ ] First @owed',
			'### Something else',
			'- [ ] Second @owed',
		].join('\n')), KNOWN);
		expect(got[0]!.people).toEqual(['Andre Kleven']);
		expect(got[1]!.people).toEqual([]);
	});

	it('attributes a promise to the activity section it sits under', () => {
		const got = parseSightings(source([
			'##### [[Activities/Roommate Test Stand|Roommate Test Stand]]',
			'- [ ] Buy the USB hub @owed [[Ida Haugland]]',
		].join('\n')), KNOWN);
		expect(got[0]!.activity).toBe('Roommate Test Stand');
	});

	it('closes the activity section at the next heading', () => {
		const got = parseSightings(source([
			'##### [[Activities/Test Stand]]',
			'- [ ] Inside @owed [[Ida Haugland]]',
			'##### Loose ends',
			'- [ ] Outside @owed [[Ida Haugland]]',
		].join('\n')), KNOWN);
		expect(got[0]!.activity).toBe('Test Stand');
		expect(got[1]!.activity).toBe('');
	});

	it('notices a promise that is already checked off', () => {
		const got = parseSightings(source('- [x] Sent it @owed [[Ida Haugland]]'), KNOWN);
		expect(got[0]!.done).toBe(true);
	});

	it('keeps the raw line so a writer can match it', () => {
		const raw = '  - [ ] Send the BOM @owed [[Ida Haugland]]';
		const got = parseSightings(source(raw), KNOWN);
		expect(got[0]!.raw).toBe(raw);
	});
});

describe('foldCommitments', () => {
	it('counts a carried-forward promise once, aged from its first sighting', () => {
		const sightings = [
			...parseSightings(source('- [ ] Send BOM @owed [[Ida Haugland]]', '2026-08-01'), KNOWN),
			...parseSightings(source('- [ ] Send BOM @owed [[Ida Haugland]]', '2026-08-15'), KNOWN),
			...parseSightings(source('- [ ] Send BOM @owed [[Ida Haugland]]', '2026-09-01'), KNOWN),
		];
		const folded = foldCommitments(sightings);
		expect(folded).toHaveLength(1);
		expect(folded[0]!.born).toBe('2026-08-01');
		expect(folded[0]!.done).toBeNull();
	});

	it('records the first completion and keeps the original birthday', () => {
		const folded = foldCommitments([
			...parseSightings(source('- [ ] Send BOM @owed [[Ida Haugland]]', '2026-08-01'), KNOWN),
			...parseSightings(source('- [x] Send BOM @owed [[Ida Haugland]]', '2026-08-20'), KNOWN),
			...parseSightings(source('- [x] Send BOM @owed [[Ida Haugland]]', '2026-08-25'), KNOWN),
		]);
		expect(folded[0]!.born).toBe('2026-08-01');
		expect(folded[0]!.done).toBe('2026-08-20');
	});

	it('handles a promise that arrives already done', () => {
		const folded = foldCommitments(
			parseSightings(source('- [x] Sent it @owed [[Ida Haugland]]', '2026-08-01'), KNOWN)
		);
		expect(folded[0]!.born).toBe('2026-08-01');
		expect(folded[0]!.done).toBe('2026-08-01');
	});

	it('folds out of order sightings chronologically', () => {
		const folded = foldCommitments([
			...parseSightings(source('- [x] Send BOM @owed [[Ida Haugland]]', '2026-08-20'), KNOWN),
			...parseSightings(source('- [ ] Send BOM @owed [[Ida Haugland]]', '2026-08-01'), KNOWN),
		]);
		expect(folded).toHaveLength(1);
		expect(folded[0]!.born).toBe('2026-08-01');
		expect(folded[0]!.done).toBe('2026-08-20');
	});

	it('splits a promise made to two people into one each', () => {
		const folded = foldCommitments(
			parseSightings(source('- [ ] Plan the lab @owed [[Andre Kleven]] [[Frederik Stray]]'), KNOWN)
		);
		expect(folded.map(c => c.person).sort()).toEqual(['Andre Kleven', 'Frederik Stray']);
	});

	it('keeps the same promise in each direction apart', () => {
		const folded = foldCommitments([
			...parseSightings(source('- [ ] Spec @owed [[Ida Haugland]]'), KNOWN),
			...parseSightings(source('- [ ] Spec @waiting [[Ida Haugland]]'), KNOWN),
		]);
		expect(folded).toHaveLength(2);
	});

	it('keeps an unaddressed promise rather than dropping it', () => {
		const folded = foldCommitments(parseSightings(source('- [ ] Book the room @owed'), KNOWN));
		expect(folded).toHaveLength(1);
		expect(folded[0]!.person).toBe(UNASSIGNED);
	});

	it('points at the note the promise was last seen open in', () => {
		const folded = foldCommitments([
			...parseSightings(source('- [ ] Send BOM @owed [[Ida Haugland]]', '2026-08-01', 'a.md'), KNOWN),
			...parseSightings(source('- [ ] Send BOM @owed [[Ida Haugland]]', '2026-09-01', 'b.md'), KNOWN),
		]);
		expect(folded[0]!.path).toBe('b.md');
	});

	it('backfills the activity from a later sighting that had one', () => {
		const folded = foldCommitments([
			...parseSightings(source('- [ ] Buy hub @owed [[Ida Haugland]]', '2026-08-01'), KNOWN),
			...parseSightings(source([
				'##### [[Activities/Test Stand]]',
				'- [ ] Buy hub @owed [[Ida Haugland]]',
			].join('\n'), '2026-08-02'), KNOWN),
		]);
		expect(folded[0]!.activity).toBe('Test Stand');
	});
});

describe('ageing', () => {
	it('measures an open promise from its birthday', () => {
		const [c] = foldCommitments(
			parseSightings(source('- [ ] Send BOM @owed [[Ida Haugland]]', '2026-08-18'), KNOWN)
		);
		expect(ageOf(c!, '2026-09-01')).toBe(14);
	});

	it('does not age a promise that is already kept', () => {
		const [c] = foldCommitments(
			parseSightings(source('- [x] Sent @owed [[Ida Haugland]]', '2026-01-01'), KNOWN)
		);
		expect(ageOf(c!, '2026-09-01')).toBe(0);
	});

	it('never reports a negative age for a future-dated note', () => {
		const [c] = foldCommitments(
			parseSightings(source('- [ ] Later @owed [[Ida Haugland]]', '2026-10-01'), KNOWN)
		);
		expect(ageOf(c!, '2026-09-01')).toBe(0);
	});

	it('counts whole days across a month boundary', () => {
		expect(daysBetween('2026-08-30', '2026-09-02')).toBe(3);
	});
});

describe('DIRECTION_LABEL', () => {
	it('spells out what the terse tags mean', () => {
		expect(DIRECTION_LABEL.owed).toBe('I owe');
		expect(DIRECTION_LABEL.waiting).toBe('Waiting on');
	});
});

describe('looksLikePerson', () => {
	it('accepts an ordinary name', () => {
		expect(looksLikePerson('Ida Haugland')).toBe(true);
		expect(looksLikePerson('Alexander Lepperød')).toBe(true);
		expect(looksLikePerson("Lluís Miquel Martínez-Campos")).toBe(true);
	});

	// The People folder accumulated notes that are about people rather than
	// being a person. Without this every one of them became a dashboard row.
	it.each([
		'EELS-W33-iteration',
		'Eels-w34 Iteration planning',
		'2025 pilot team deliveries',
		'Communications-overview',
		'Test-2',
		'Норвегия.Деньги',
		'Person Template',
	])('rejects %s', name => {
		expect(looksLikePerson(name)).toBe(false);
	});

	it('rejects the empty and the implausibly long', () => {
		expect(looksLikePerson('   ')).toBe(false);
		expect(looksLikePerson('x'.repeat(41))).toBe(false);
	});
});

describe('personFrom', () => {
	it('resolves a bare name only when a page exists', () => {
		expect(personFrom('Ida Haugland', KNOWN)).toBe('Ida Haugland');
		expect(personFrom('Some Stranger', KNOWN)).toBeNull();
	});

	it('resolves a People path without needing a known page', () => {
		expect(personFrom('People/Odin', KNOWN)).toBe('Odin');
		expect(personFrom('People/Archive/Frode', KNOWN)).toBe('Frode');
	});

	it('refuses a People path that is not a person', () => {
		expect(personFrom('People/EELS-W33-iteration', KNOWN)).toBeNull();
		expect(personFrom('People/Meetings/Standup', KNOWN)).toBeNull();
	});

	it('ignores links outside the People folder', () => {
		expect(personFrom('Activities/Radio spec', KNOWN)).toBeNull();
	});
});
