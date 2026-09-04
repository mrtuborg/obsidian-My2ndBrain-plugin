import { LifeBalance, Consistency, ConsistencyDay } from '../components/LifeStats';

/**
 * The two long-run charts on Home. Kept out of HomeView because they are the
 * only place in the plugin that does geometry, and because a chart is worth
 * reading on its own terms: everything here turns an already-computed model
 * into shapes, and decides nothing about what the numbers mean.
 */

// Wider than it is tall: the web itself is small, but role names sit outside
// it and "Entrepreneur" needs real room either side or it gets clipped.
const RADAR_W = 250;
const RADAR_H = 176;
const RADAR_CX = RADAR_W / 2;
const RADAR_CY = 84;
const RADAR_RADIUS = 54;
/** Labels ride outside the outer ring so they never sit on the shape. */
const LABEL_RADIUS = RADAR_RADIUS + 18;
/** Rings at 25/50/75/100% of the busiest role, for reading a value off the shape. */
const RADAR_RINGS = [0.25, 0.5, 0.75, 1];

interface Point {
	x: number;
	y: number;
}

/** Axis `i` of `n`, at `ratio` of full radius. Starts at 12 o'clock, goes clockwise. */
function polar(i: number, n: number, ratio: number, radius = RADAR_RADIUS): Point {
	const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
	return {
		x: RADAR_CX + Math.cos(angle) * radius * ratio,
		y: RADAR_CY + Math.sin(angle) * radius * ratio,
	};
}

function points(list: Point[]): string {
	return list.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

function ring(n: number, ratio: number): string {
	return points(Array.from({ length: n }, (_, i) => polar(i, n, ratio)));
}

/**
 * A radar of role attention. The shape answers one question — is my life
 * lopsided — so it is normalized against my own busiest role rather than any
 * absolute target. A round shape is a balanced year; a spike is a year spent
 * on one thing.
 */
export function renderRadar(container: HTMLElement, balance: LifeBalance): void {
	const panel = container.createDiv({ cls: 'twobrain-home-panel' });
	panel.addClass('is-radar');

	const head = panel.createDiv({ cls: 'twobrain-home-panel-head' });
	head.createSpan({ cls: 'twobrain-home-panel-title', text: 'Life balance' });
	head.createSpan({ cls: 'twobrain-home-panel-sub', text: 'last 12 months' });

	if (!balance.hasData) {
		panel.createDiv({
			cls: 'twobrain-home-panel-empty',
			text: 'No role history yet — it fills in as you work through your days.',
		});
		return;
	}

	const n = balance.roles.length;
	const svg = panel.createSvg('svg', { cls: 'twobrain-home-radar' });
	svg.setAttribute('viewBox', `0 0 ${RADAR_W} ${RADAR_H}`);
	svg.setAttribute('role', 'img');
	svg.setAttribute(
		'aria-label',
		balance.roles.map(r => `${r.role}: ${r.days} days`).join(', ')
	);

	for (const r of RADAR_RINGS) {
		const web = svg.createSvg('polygon', { cls: 'twobrain-radar-ring' });
		web.setAttribute('points', ring(n, r));
	}

	for (let i = 0; i < n; i++) {
		const spoke = svg.createSvg('line', { cls: 'twobrain-radar-spoke' });
		const end = polar(i, n, 1);
		spoke.setAttribute('x1', String(RADAR_CX));
		spoke.setAttribute('y1', String(RADAR_CY));
		spoke.setAttribute('x2', end.x.toFixed(1));
		spoke.setAttribute('y2', end.y.toFixed(1));
	}

	// Your own average, so the gap between the shape and this ring reads as
	// "how far off balance", without needing an arbitrary ideal.
	const mean = svg.createSvg('polygon', { cls: 'twobrain-radar-mean' });
	mean.setAttribute('points', ring(n, balance.mean));

	const shape = svg.createSvg('polygon', { cls: 'twobrain-radar-shape' });
	shape.setAttribute('points', points(balance.roles.map((r, i) => polar(i, n, r.ratio))));

	balance.roles.forEach((role, i) => {
		const at = polar(i, n, role.ratio);
		const dot = svg.createSvg('circle', { cls: 'twobrain-radar-dot' });
		if (role.days === 0) dot.addClass('is-empty');
		dot.setAttribute('cx', at.x.toFixed(1));
		dot.setAttribute('cy', at.y.toFixed(1));
		dot.setAttribute('r', '2.6');

		const label = polar(i, n, 1, LABEL_RADIUS);
		const text = svg.createSvg('text', { cls: 'twobrain-radar-label' });
		text.setAttribute('x', label.x.toFixed(1));
		text.setAttribute('y', label.y.toFixed(1));
		text.setAttribute('text-anchor', anchorFor(label.x));
		text.setAttribute('dominant-baseline', 'middle');
		text.textContent = role.role;

		const value = svg.createSvg('text', { cls: 'twobrain-radar-value' });
		value.setAttribute('x', label.x.toFixed(1));
		value.setAttribute('y', (label.y + 9).toFixed(1));
		value.setAttribute('text-anchor', anchorFor(label.x));
		value.setAttribute('dominant-baseline', 'middle');
		value.textContent = String(role.days);
	});
}

/** Labels left of centre hang right-aligned so they never run off the box. */
function anchorFor(x: number): string {
	if (x < RADAR_CX - 4) return 'end';
	if (x > RADAR_CX + 4) return 'start';
	return 'middle';
}

/**
 * A year of days, one cell each. The point isn't any single day — it's
 * whether the habit held, which only a whole year at once can show.
 */
export function renderConsistency(
	container: HTMLElement,
	data: Consistency,
	onOpenDay: (date: string) => void
): void {
	const panel = container.createDiv({ cls: 'twobrain-home-panel' });
	panel.addClass('is-consistency');

	const head = panel.createDiv({ cls: 'twobrain-home-panel-head' });
	head.createSpan({ cls: 'twobrain-home-panel-title', text: 'Consistency' });
	head.createSpan({
		cls: 'twobrain-home-panel-sub',
		text: `${data.activeDays} days · best ${data.longestStreak}`,
	});

	const streak = panel.createDiv({ cls: 'twobrain-home-streak' });
	streak.createSpan({ cls: 'twobrain-home-streak-num', text: String(data.currentStreak) });
	streak.createSpan({
		cls: 'twobrain-home-streak-label',
		text: data.currentStreak === 1 ? 'day streak' : 'days in a row',
	});

	const scroll = panel.createDiv({ cls: 'twobrain-home-grid-scroll' });
	const grid = scroll.createDiv({ cls: 'twobrain-home-grid' });

	const months = grid.createDiv({ cls: 'twobrain-home-grid-months' });
	for (const { week, label } of data.monthLabels) {
		const tick = months.createSpan({ cls: 'twobrain-home-grid-month', text: label });
		tick.setAttribute('style', `grid-column: ${week + 1}`);
	}

	const cells = grid.createDiv({ cls: 'twobrain-home-grid-cells' });
	for (const week of data.weeks) {
		const column = cells.createDiv({ cls: 'twobrain-home-grid-week' });
		for (const day of week) renderCell(column, day, onOpenDay);
	}

	renderLegend(panel);
}

function renderCell(
	column: HTMLElement,
	day: ConsistencyDay | null,
	onOpenDay: (date: string) => void
): void {
	if (!day) {
		column.createDiv({ cls: 'twobrain-home-grid-cell' }).addClass('is-pad');
		return;
	}

	const cell = column.createDiv({ cls: 'twobrain-home-grid-cell' });
	cell.addClass(`is-l${day.level}`);
	cell.setAttribute(
		'title',
		day.level === 0
			? `${day.date} — nothing written`
			: `${day.date} — ${day.roles} role${day.roles === 1 ? '' : 's'}`
	);
	if (day.level === 0) return;

	cell.addClass('is-open');
	cell.addEventListener('click', () => onOpenDay(day.date));
}

function renderLegend(panel: HTMLElement): void {
	const legend = panel.createDiv({ cls: 'twobrain-home-legend' });
	legend.createSpan({ cls: 'twobrain-home-legend-label', text: 'quiet' });
	for (let level = 0; level <= 4; level++) {
		legend.createDiv({ cls: 'twobrain-home-grid-cell' }).addClass(`is-l${level}`);
	}
	legend.createSpan({ cls: 'twobrain-home-legend-label', text: 'full' });
}
