import { AppLike } from '../utilities/FileIO';

/** Fence the plugin's markdown code block processor renders the live dashboard into. */
export const PEOPLE_CODE_BLOCK_LANG = '2ndbrain-people';

const PEOPLE_STUB = [
	'---',
	'---',
	'# People',
	'',
	'```' + PEOPLE_CODE_BLOCK_LANG,
	'```',
	'',
].join('\n');

/**
 * Obsidian-facing wrapper around the People dashboard.
 *
 * Same shape as the Projects composer: the note is only a host for a live
 * code block, never regenerated markdown. Here the reasoning is stronger
 * still — the view writes back to journal lines and creates People pages,
 * neither of which a static table could offer.
 */
export class PeopleDashboardComposer {

	async refresh(app: AppLike, path: string): Promise<void> {
		const file = app.vault.getAbstractFileByPath(path);
		if (!file) return;

		const content = await app.vault.read(file);
		if (content.includes('```' + PEOPLE_CODE_BLOCK_LANG)) return;

		await app.vault.modify(file, PEOPLE_STUB);
	}

	/** The note skeleton: frontmatter, title, and the live-view code block. */
	stub(): string {
		return PEOPLE_STUB;
	}
}
