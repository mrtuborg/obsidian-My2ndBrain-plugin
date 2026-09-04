import { App, TFile } from 'obsidian';
import {
	ContactStatus, CONTACT_STATUS_FIELD, normalizeStatus,
} from '../components/ContactChecklist';

/** The pre-existing convention: people filed under `People/Archive/`. */
export function isArchivedPath(path: string): boolean {
	return /\/Archive\//i.test(path);
}

/**
 * The status filed against a person's page.
 *
 * Read from the metadata cache rather than the file, so Home can group every
 * contact without opening a single note. `getFileCache` is populated for the
 * whole vault at startup and kept current by Obsidian; reading N People pages
 * on every Home render is exactly the cost the rest of this page is written
 * to avoid.
 */
export function personStatus(app: App, path: string): ContactStatus {
	const file = app.vault.getAbstractFileByPath(path);
	const frontmatter = file instanceof TFile
		? app.metadataCache.getFileCache(file)?.frontmatter
		: undefined;
	return normalizeStatus(frontmatter?.[CONTACT_STATUS_FIELD], isArchivedPath(path));
}

/**
 * Files a person as active, inactive or archived.
 *
 * Frontmatter, not a folder move: renaming a page rewrites every journal link
 * that points at it, which is a large, irreversible edit to make on a button
 * press — and it would rewrite the very history the checklist reads. The
 * field is invisible in reading view and survives `ActivityComposer`, which
 * preserves any frontmatter key outside its own standard set.
 *
 * `processFrontMatter` is used rather than a read-modify-write because it
 * serialises against Obsidian's own writes; the People pipeline may be
 * rewriting the same file when the button is pressed.
 */
export async function setPersonStatus(
	app: App, path: string, status: ContactStatus
): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) throw new Error(`${path} is not a file`);

	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		// 'active' is the default, so it normally needs no key at all — except
		// for someone sitting under People/Archive/, where the path says
		// otherwise and only an explicit field can outvote it.
		if (status === 'active' && !isArchivedPath(path)) {
			delete frontmatter[CONTACT_STATUS_FIELD];
			return;
		}
		frontmatter[CONTACT_STATUS_FIELD] = status;
	});
}
