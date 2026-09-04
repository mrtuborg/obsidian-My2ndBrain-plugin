import { AppLike, FileIO } from './FileIO';

export interface ProjectRecord {
	/** Matches an activity's `project:` value (folder name, or file basename without extension). */
	slug: string;
	path: string;
	/** Raw `role:` frontmatter value, trimmed. '' if unset. */
	role: string;
}

/**
 * Scans the Projects folder and resolves each project to a single record,
 * accepting both `Projects/<slug>.md` and `Projects/<slug>/Project.md`
 * layouts. Other files inside a project folder (README, notes) are not
 * projects of their own.
 *
 * Shared by every dashboard that needs the project list, so the resolution
 * rules live in exactly one place — same reasoning as loadActivityRecords.
 */
export async function loadProjectRecords(
	app: AppLike,
	projectsFolder: string
): Promise<ProjectRecord[]> {
	const fileIO = new FileIO();
	const files = app.vault.getFiles().filter(f =>
		f.path.startsWith(projectsFolder + '/') && f.path.endsWith('.md')
	);

	const result: ProjectRecord[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		const parts = file.path.slice(projectsFolder.length + 1).split('/');
		let slug: string;
		if (parts.length === 1) {
			slug = parts[0]!.replace(/\.md$/, '');
		} else if (parts[parts.length - 1] === 'Project.md') {
			slug = parts[0]!;
		} else {
			continue;
		}
		if (seen.has(slug)) continue;
		seen.add(slug);

		const content = await fileIO.loadFile(app, file.path);
		if (content === null) continue;
		result.push({
			slug,
			path: file.path,
			role: fileIO.parseFrontmatterField(content, 'role') ?? '',
		});
	}
	return result;
}
