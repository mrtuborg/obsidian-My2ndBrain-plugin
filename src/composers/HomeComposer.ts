import { AppLike } from '../utilities/FileIO';

/** Fence the plugin's markdown code block processor renders the live home page into. */
export const HOME_CODE_BLOCK_LANG = '2ndbrain-home';

const HOME_STUB = [
	'---',
	'---',
	'# Home',
	'',
	'```' + HOME_CODE_BLOCK_LANG,
	'```',
	'',
].join('\n');

/**
 * Obsidian-facing wrapper that ensures the Home note contains the live-view
 * code block. Same shape as EisenhowerMatrixComposer / ProjectsDashboardComposer:
 * no markdown is generated or rewritten — the note just needs to hold the
 * block once, and HomeView renders everything from there.
 */
export class HomeComposer {
	async refresh(app: AppLike, path: string): Promise<void> {
		const file = app.vault.getAbstractFileByPath(path);
		if (!file) return;

		const content = await app.vault.read(file);
		if (content.includes('```' + HOME_CODE_BLOCK_LANG)) return;

		await app.vault.modify(file, HOME_STUB);
	}

	/** The note skeleton: frontmatter, title, and the live-view code block. */
	stub(): string {
		return HOME_STUB;
	}
}
