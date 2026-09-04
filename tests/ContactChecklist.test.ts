import {
	ContactChecklist, ChecklistSource, ContactStatus,
	normalizeStatus, DEFAULT_OVERDUE_DAYS,
} from '../src/components/ContactChecklist';

const checklist = new ContactChecklist();

function person(over: Partial<ChecklistSource> & { name: string }): ChecklistSource {
	return {
		path: `People/${over.name}.md`,
		missingPage: false,
		owed: 0,
		waiting: 0,
		days: 3,
		lastSeen: '2026-01-01',
		daysSinceSeen: 10,
		...over,
	};
}

function build(
	rows: ChecklistSource[],
	status: Record<string, ContactStatus> = {},
	overdueAfterDays = DEFAULT_OVERDUE_DAYS
) {
	return checklist.build({
		rows,
		statusOf: path => status[path] ?? 'active',
		overdueAfterDays,
		today: '2026-01-11',
	});
}

describe('normalizeStatus', () => {
	it('defaults to active when nothing is filed', () => {
		expect(normalizeStatus(undefined)).toBe('active');
		expect(normalizeStatus(null)).toBe('active');
		expect(normalizeStatus('')).toBe('active');
	});

	it('reads the three states, case and whitespace insensitively', () => {
		expect(normalizeStatus(' Inactive ')).toBe('inactive');
		expect(normalizeStatus('ARCHIVED')).toBe('archived');
		expect(normalizeStatus('active')).toBe('active');
	});

	it('falls back to active on a value it does not recognise', () => {
		expect(normalizeStatus('retired')).toBe('active');
		expect(normalizeStatus(42)).toBe('active');
		expect(normalizeStatus(true)).toBe('active');
	});

	it('treats the legacy Archive folder as archived', () => {
		expect(normalizeStatus(undefined, true)).toBe('archived');
	});

	it('lets an explicit field outvote the Archive folder', () => {
		// Otherwise "move back to active" can never work for the people who
		// most need it — the ones already filed under People/Archive/.
		expect(normalizeStatus('active', true)).toBe('active');
	});
});

describe('ContactChecklist grouping', () => {
	it('splits contacts into the three filed states', () => {
		const list = build(
			[person({ name: 'A' }), person({ name: 'B' }), person({ name: 'C' })],
			{ 'People/B.md': 'inactive', 'People/C.md': 'archived' }
		);
		expect(list.active.map(e => e.name)).toEqual(['A']);
		expect(list.inactive.map(e => e.name)).toEqual(['B']);
		expect(list.archived.map(e => e.name)).toEqual(['C']);
	});

	it('drops anyone without a page — there is nowhere to file their status', () => {
		const list = build([
			person({ name: 'A' }),
			person({ name: 'Ghost', path: null, missingPage: true }),
		]);
		expect(list.active.map(e => e.name)).toEqual(['A']);
	});

	it('drops excluded names such as the unassigned bucket', () => {
		const list = checklist.build({
			rows: [person({ name: 'A' }), person({ name: '(unassigned)' })],
			statusOf: () => 'active',
			overdueAfterDays: 30,
			today: '2026-01-11',
			exclude: new Set(['(unassigned)']),
		});
		expect(list.active.map(e => e.name)).toEqual(['A']);
	});
});

describe('ContactChecklist ordering', () => {
	it('puts the longest silence first', () => {
		const list = build([
			person({ name: 'Recent', daysSinceSeen: 2 }),
			person({ name: 'Old', daysSinceSeen: 90 }),
			person({ name: 'Middle', daysSinceSeen: 30 }),
		]);
		expect(list.active.map(e => e.name)).toEqual(['Old', 'Middle', 'Recent']);
	});

	it('ranks someone never mentioned above everyone else', () => {
		const list = build([
			person({ name: 'Old', daysSinceSeen: 900 }),
			person({ name: 'Never', daysSinceSeen: null, lastSeen: '', days: 0 }),
		]);
		expect(list.active.map(e => e.name)).toEqual(['Never', 'Old']);
	});

	it('sinks anyone already logged today to the bottom', () => {
		const list = build([
			person({ name: 'Done', daysSinceSeen: 0, lastSeen: '2026-01-11' }),
			person({ name: 'Todo', daysSinceSeen: 5 }),
		]);
		expect(list.active.map(e => e.name)).toEqual(['Todo', 'Done']);
		expect(list.logged).toBe(1);
	});

	it('breaks ties by name so the order never jitters between renders', () => {
		const list = build([
			person({ name: 'Bea', daysSinceSeen: 5 }),
			person({ name: 'Abe', daysSinceSeen: 5 }),
		]);
		expect(list.active.map(e => e.name)).toEqual(['Abe', 'Bea']);
	});
});

describe('ContactChecklist overdue', () => {
	it('flags an active contact past the threshold', () => {
		const list = build([person({ name: 'A', daysSinceSeen: 31 })], {}, 30);
		expect(list.active[0]!.overdue).toBe(true);
		expect(list.overdue).toBe(1);
	});

	it('leaves someone inside the threshold alone', () => {
		const list = build([person({ name: 'A', daysSinceSeen: 29 })], {}, 30);
		expect(list.active[0]!.overdue).toBe(false);
		expect(list.overdue).toBe(0);
	});

	it('flags a contact who has never been mentioned at all', () => {
		const list = build([person({ name: 'A', daysSinceSeen: null, lastSeen: '' })]);
		expect(list.active[0]!.overdue).toBe(true);
	});

	it('never flags a filed contact — you already said their silence is fine', () => {
		const list = build(
			[person({ name: 'A', daysSinceSeen: 900 }), person({ name: 'B', daysSinceSeen: 900 })],
			{ 'People/A.md': 'inactive', 'People/B.md': 'archived' }
		);
		expect(list.inactive[0]!.overdue).toBe(false);
		expect(list.archived[0]!.overdue).toBe(false);
		expect(list.overdue).toBe(0);
	});

	it('falls back to the default rather than flagging everyone on a bad setting', () => {
		const list = build([person({ name: 'A', daysSinceSeen: 5 })], {}, 0);
		expect(list.active[0]!.overdue).toBe(false);
	});
});

describe('ContactChecklist.age', () => {
	it.each([
		[null, 'never'],
		[0, 'today'],
		[1, 'yesterday'],
		[3, '3d'],
		[14, '2w'],
		[90, '3mo'],
		[400, '1.1y'],
	])('renders %s as %s', (days, expected) => {
		expect(checklist.age(days as number | null)).toBe(expected);
	});
});

describe('ContactChecklist contact log', () => {
	it('writes a plain linked bullet, not a task', () => {
		// A checkbox would invite the daily-note pipeline to carry it forward
		// forever; the link is what the journal scan reads back as contact.
		expect(checklist.contactLogLine('Ida Haugland')).toBe('- Talked to [[Ida Haugland]]');
	});

	it('appends to the end, leaving existing content untouched', () => {
		const line = checklist.contactLogLine('Ida');
		expect(checklist.appendContactLog('## Notes\nSomething\n', line))
			.toBe('## Notes\nSomething\n- Talked to [[Ida]]\n');
	});

	it('does not append twice', () => {
		const line = checklist.contactLogLine('Ida');
		expect(checklist.appendContactLog(`Work\n${line}\n`, line)).toBeNull();
	});

	it('handles an empty note without leading blank lines', () => {
		const line = checklist.contactLogLine('Ida');
		expect(checklist.appendContactLog('', line)).toBe('- Talked to [[Ida]]\n');
	});

	it('leaves the existing note untouched, including trailing blank lines', () => {
		const line = checklist.contactLogLine('Ida');
		// A trailing blank line can be deliberate, and two trailing spaces are
		// a Markdown hard break. Ticking a checkbox must not rewrite prose.
		expect(checklist.appendContactLog('Work\n\n\n', line))
			.toBe('Work\n\n\n- Talked to [[Ida]]\n');
		expect(checklist.appendContactLog('A line  \n', line))
			.toBe('A line  \n- Talked to [[Ida]]\n');
	});

	it('adds a newline first when the note does not end with one', () => {
		const line = checklist.contactLogLine('Ida');
		expect(checklist.appendContactLog('Work', line)).toBe('Work\n- Talked to [[Ida]]\n');
	});
});
