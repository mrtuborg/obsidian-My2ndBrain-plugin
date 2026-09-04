import { AppLike, FileIO } from '../utilities/FileIO';
import { loadActivityRecords } from '../utilities/ActivityIndex';
import { ProjectsDashboard, DashboardActivity, DashboardProject } from '../components/ProjectsDashboard';

export interface ProjectsDashboardSettings {
	activitiesFolder: string;
	archiveFolder: string;
	projectsFolder: string;
}

/** Fence the plugin's markdown code block processor renders the live dashboard into. */
export const PROJECTS_CODE_BLOCK_LANG = '2ndbrain-projects';

const PROJECTS_STUB = [
	'---',
	'---',
	'# Projects Dashboard',
	'',
	'```' + PROJECTS_CODE_BLOCK_LANG,
	'```',
	'',
].join('\n');

/**
 * Obsidian-facing wrapper around ProjectsDashboard.
 *
 * Like the Eisenhower matrix, the dashboard is a live view rendered from a
 * `2ndbrain-projects` code block rather than regenerated markdown: static
 * tables can't carry progress bars, health pills or the inline role picker,
 * and rewriting the note on every open was a steady source of sync churn on
 * a file the user never edits by hand. This composer therefore only ensures
 * the note contains that block.
 */
export class ProjectsDashboardComposer {
	private fileIO = new FileIO();
	private dashboard = new ProjectsDashboard();

	constructor(private settings: ProjectsDashboardSettings) {}

	async refresh(app: AppLike, path: string): Promise<void> {
		const file = app.vault.getAbstractFileByPath(path);
		if (!file) return;

		const content = await app.vault.read(file);
		if (content.includes('```' + PROJECTS_CODE_BLOCK_LANG)) return;

		await app.vault.modify(file, PROJECTS_STUB);
	}

	/** The note skeleton: frontmatter, title, and the live-view code block. */
	stub(): string {
		return PROJECTS_STUB;
	}

	/**
	 * Static markdown rendering of the same rollup. No longer used for the
	 * note itself, but kept as the pure, testable description of the data —
	 * and as an export path for anywhere a live view can't run.
	 */
	async generate(app: AppLike): Promise<string> {
		const activities: DashboardActivity[] = await loadActivityRecords(
			app, this.settings.activitiesFolder, this.settings.archiveFolder
		);
		const projects = await this.loadProjects(app);
		const today = this.fileIO.todayDate();
		const rows = this.dashboard.buildRows(activities, projects, today);
		return this.dashboard.render(rows, today);
	}

	/**
	 * A "project" is either a top-level Projects/<slug>.md file, or a
	 * Projects/<slug>/Project.md inside a project subfolder — mirrors the
	 * two shapes already used across the vault.
	 */
	private async loadProjects(app: AppLike): Promise<DashboardProject[]> {
		const { projectsFolder } = this.settings;
		const files = app.vault.getFiles().filter(f =>
			f.path.startsWith(projectsFolder + '/') &&
			f.path.endsWith('.md')
		);

		const result: DashboardProject[] = [];
		const seen = new Set<string>();
		for (const file of files) {
			const rel = file.path.slice(projectsFolder.length + 1);
			const parts = rel.split('/');
			let slug: string;
			if (parts.length === 1) {
				slug = file.basename;
			} else if (parts[parts.length - 1] === 'Project.md') {
				slug = parts[0]!;
			} else {
				continue;
			}
			if (seen.has(slug)) continue;
			seen.add(slug);

			const handle = app.vault.getAbstractFileByPath(file.path);
			if (!handle) continue;
			const content = await app.vault.read(handle);
			const role = this.fileIO.parseFrontmatterField(content, 'role') ?? '';
			result.push({ slug, path: file.path, role });
		}
		return result;
	}
}
