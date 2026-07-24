/**
 * One-time cleanup for the "AutoActivityCreator project-wide sweep" bug
 * (fixed in DailyNoteComposer.runAutoCreator — see commit history).
 *
 * That bug created empty Activity stubs for every unresolved [[link]] found
 * anywhere under Projects/, not just links the user actually wrote. All
 * such stubs share one exact, distinctive frontmatter signature and were
 * never touched afterward (empty ## Journal section).
 *
 * This must run through app.vault.delete() (the real Obsidian API), not a
 * raw filesystem delete — only vault.delete() records a proper tombstone
 * that Obsidian Sync propagates to other devices. A plain `rm`/`mv` outside
 * Obsidian is invisible to Sync and gets silently restored on the next sync
 * pass, which is what happened the first time this cleanup was attempted.
 */

export interface StaleStubAppLike {
	vault: {
		getFiles(): Array<{ path: string; name: string }>;
		read(file: unknown): Promise<string>;
		delete(file: unknown): Promise<void>;
		getAbstractFileByPath(path: string): unknown;
	};
}

/** Matches the exact frontmatter signature left by the project-wide sweep bug. */
export function isStaleAutoCreatedStub(content: string): boolean {
	const startDate = /startDate:\s*(\S+)/.exec(content)?.[1];
	const stage = /stage:\s*(\S+)/.exec(content)?.[1];
	const type = /type:\s*(\S+)/.exec(content)?.[1];
	const journalMatch = /## Journal\s*\n([\s\S]*?)\n----/.exec(content);
	const journalEmpty = journalMatch !== null && (journalMatch[1] ?? '').trim() === '';

	return startDate === '2026-07-16' && stage === 'backlog' && type === 'project' && journalEmpty;
}

export interface CleanupResult {
	deleted: string[];
	failed: Array<{ path: string; error: string }>;
}

/**
 * Scans `activitiesFolder` for stale auto-created stubs and deletes them via
 * the real vault API so Sync propagates the deletion correctly.
 */
export async function cleanupStaleAutoCreatedStubs(
	app: StaleStubAppLike,
	activitiesFolder: string
): Promise<CleanupResult> {
	const result: CleanupResult = { deleted: [], failed: [] };

	const candidates = app.vault.getFiles().filter(
		f => f.path.startsWith(activitiesFolder + '/') && f.path.endsWith('.md')
	);

	for (const f of candidates) {
		try {
			const content = await app.vault.read(app.vault.getAbstractFileByPath(f.path));
			if (isStaleAutoCreatedStub(content)) {
				await app.vault.delete(app.vault.getAbstractFileByPath(f.path));
				result.deleted.push(f.path);
			}
		} catch (err) {
			result.failed.push({ path: f.path, error: (err as Error).message ?? String(err) });
		}
	}

	return result;
}
