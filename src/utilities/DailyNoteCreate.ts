import { App, TFile, Notice, moment, normalizePath } from 'obsidian';

/**
 * Creates and opens today's daily note.
 *
 * This deliberately does not invent a location. A vault's daily notes live
 * wherever its Daily notes settings say — this one nests them as
 * `Journal/2026/09.September/2026-09-04.md` — and a note created anywhere
 * else is not today's note, it is a stray file that the rest of the plugin
 * will not find and the user has to delete.
 *
 * So the core Daily notes plugin does the work whenever it can: it already
 * knows the folder, the date format and the template, and it is the same
 * code path as clicking the calendar ribbon. Everything here is fallback for
 * when that plugin is switched off.
 *
 * Opening is not a convenience — it is the point. The plugin fills a daily
 * note from its `file-open` handler, so a note that is created without being
 * opened just sits there empty.
 */

/**
 * The bits of Obsidian's internals this needs. Neither the command registry
 * nor the internal plugin registry is in the public typings, so they are
 * described here and every access is guarded: on a version where they have
 * moved, the fallback path still works.
 */
interface InternalApp {
	commands?: {
		commands?: Record<string, unknown>;
		executeCommandById?: (id: string) => boolean;
	};
	internalPlugins?: {
		getPluginById?: (id: string) => {
			enabled?: boolean;
			instance?: { options?: DailyNotesOptions };
		} | null;
	};
}

interface DailyNotesOptions {
	folder?: string;
	format?: string;
	template?: string;
}

/** Obsidian's own default when the Daily notes format is left blank. */
const DEFAULT_FORMAT = 'YYYY-MM-DD';

const CORE_COMMAND = 'daily-notes';

/**
 * Runs the core "Open today's daily note" command.
 *
 * Preferred over building a path by hand because it also applies the user's
 * template, and because a format string this code does not understand is
 * still a format string the core plugin does.
 */
function runCoreCommand(app: App): boolean {
	const commands = (app as unknown as InternalApp).commands;
	if (!commands?.executeCommandById) return false;
	// Checking first, because executeCommandById on an unknown id is a
	// silent no-op that is indistinguishable from a command that ran.
	if (commands.commands && !(CORE_COMMAND in commands.commands)) return false;

	try {
		return commands.executeCommandById(CORE_COMMAND) === true;
	} catch (e) {
		console.error('[2ndBrain]', e);
		return false;
	}
}

/** The core Daily notes settings, when that plugin is on. */
function coreOptions(app: App): DailyNotesOptions | null {
	try {
		const plugin = (app as unknown as InternalApp).internalPlugins
			?.getPluginById?.(CORE_COMMAND);
		return plugin?.instance?.options ?? null;
	} catch (e) {
		console.error('[2ndBrain]', e);
		return null;
	}
}

/**
 * Where today's note goes.
 *
 * `format` is a moment pattern that may contain slashes — the nesting into
 * year and month folders is expressed as part of the filename pattern, which
 * is why this returns a whole path rather than a folder plus a basename.
 */
export function todaysDailyNotePath(
	options: DailyNotesOptions | null, journalFolder: string
): string {
	const folder = (options?.folder ?? journalFolder).replace(/\/+$/, '');
	const format = options?.format?.trim() || DEFAULT_FORMAT;
	const name = moment().format(format);
	return normalizePath(folder === '' ? `${name}.md` : `${folder}/${name}.md`);
}

/** Creates every missing folder on the way down to the note. */
async function ensureParents(app: App, path: string): Promise<void> {
	const parts = path.split('/').slice(0, -1);
	for (let i = 1; i <= parts.length; i++) {
		const folder = parts.slice(0, i).join('/');
		if (app.vault.getAbstractFileByPath(folder)) continue;
		try {
			await app.vault.createFolder(folder);
		} catch (e) {
			// A folder that appeared between the check and the create is the
			// outcome we wanted anyway.
			if (!(e as Error).message?.includes('already exists')) throw e;
		}
	}
}

async function templateContent(app: App, options: DailyNotesOptions | null): Promise<string> {
	const path = options?.template?.trim();
	if (!path) return '';
	const file = app.vault.getAbstractFileByPath(
		normalizePath(path.endsWith('.md') ? path : `${path}.md`)
	);
	if (!(file instanceof TFile)) return '';
	try {
		return await app.vault.read(file);
	} catch (e) {
		console.error('[2ndBrain]', e);
		return '';
	}
}

/**
 * Ensures today's daily note exists and is open.
 *
 * Returns false when nothing could be created, having already told the user
 * why — the caller is a button, and a button that reports its own failure
 * twice is worse than one that reports it once.
 */
export async function createTodaysDailyNote(
	app: App, journalFolder: string
): Promise<boolean> {
	if (runCoreCommand(app)) return true;

	const options = coreOptions(app);
	const path = todaysDailyNotePath(options, journalFolder);

	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		await app.workspace.getLeaf(false).openFile(existing);
		return true;
	}

	try {
		await ensureParents(app, path);
		const file = await app.vault.create(path, await templateContent(app, options));
		await app.workspace.getLeaf(false).openFile(file);
		return true;
	} catch (e) {
		const message = (e as Error).message ?? '';
		// Lost a race with something else creating it — still a success.
		if (message.includes('already exists')) {
			const file = app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				await app.workspace.getLeaf(false).openFile(file);
				return true;
			}
		}
		new Notice(`2ndBrain: Could not create ${path} — ${message}`);
		console.error('[2ndBrain]', e);
		return false;
	}
}
