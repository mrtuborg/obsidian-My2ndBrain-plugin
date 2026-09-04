import { ROLES } from '../roles';
import { PRIORITY_KEYS } from '../components/EisenhowerMatrix';

export interface SelectOption {
	value: string;
	label: string;
}

/** Shown for a field that is deliberately unset, and selectable to clear it. */
const BLANK: SelectOption = { value: '', label: '—' };

export const STAGE_VALUES: readonly string[] = ['doing', 'backlog', 'done'];

/**
 * Value sets for the matrix's editable columns.
 *
 * A dropdown must never silently drop the value a file already holds: an
 * activity tagged with a retired role, a hand-typed priority, or a project
 * that no longer exists would otherwise be rewritten to something else the
 * moment the user touched a different column. Every builder below therefore
 * unions the known vocabulary with whatever `current` actually is.
 */
function withCurrent(options: SelectOption[], current: string): SelectOption[] {
	const trimmed = current.trim();
	if (!trimmed || options.some(o => o.value === trimmed)) return options;
	return [...options, { value: trimmed, label: `${trimmed} (unknown)` }];
}

export function stageOptions(current: string): SelectOption[] {
	return withCurrent(
		[BLANK, ...STAGE_VALUES.map(v => ({ value: v, label: v }))],
		current
	);
}

export function roleOptions(current: string): SelectOption[] {
	return withCurrent(
		[BLANK, ...ROLES.map(r => ({ value: r, label: r }))],
		current
	);
}

export function priorityOptions(current: string): SelectOption[] {
	return withCurrent(
		[BLANK, ...PRIORITY_KEYS.map(k => ({ value: k, label: k }))],
		current
	);
}

/**
 * Project names the user can assign, derived from the vault rather than a
 * fixed list. A project is either a folder under `projectsFolder/` (the usual
 * shape, holding the project's notes) or a bare `.md` file directly inside it.
 * Attachment folders are indistinguishable from projects here, so anything
 * already referenced by an activity is included too — that keeps real
 * assignments selectable even when the folder scan misses them.
 */
export function collectProjectNames(
	allPaths: string[],
	projectsFolder: string,
	usedValues: string[]
): string[] {
	const prefix = projectsFolder + '/';
	const names = new Set<string>();

	for (const path of allPaths) {
		if (!path.startsWith(prefix)) continue;
		const rest = path.slice(prefix.length);
		const slash = rest.indexOf('/');
		if (slash > 0) {
			names.add(rest.slice(0, slash));
		} else if (rest.endsWith('.md')) {
			names.add(rest.slice(0, -3));
		}
	}

	for (const used of usedValues) {
		const trimmed = used.trim();
		if (trimmed) names.add(trimmed);
	}

	return [...names].sort((a, b) => a.localeCompare(b));
}

export function projectOptions(names: string[], current: string): SelectOption[] {
	return withCurrent([BLANK, ...names.map(n => ({ value: n, label: n }))], current);
}
