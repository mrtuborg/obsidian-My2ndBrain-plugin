import { AppLike, FileIO } from '../utilities/FileIO';
import { loadActivityRecords } from '../utilities/ActivityIndex';
import { ProjectsDashboard, DashboardActivity, DashboardProject } from '../components/ProjectsDashboard';

export interface ProjectsDashboardSettings {
	activitiesFolder: string;
	archiveFolder: string;
	projectsFolder: string;
}

/**
 * Obsidian-facing wrapper around ProjectsDashboard: gathers every Activity
 * and every Project from the vault, computes the per-project rollup, and
 * writes the rendered markdown into the dashboard note. Regenerated on
 * every open (see main.ts routeFile) so it's always fresh for a periodic
 * review — never hand-edited, same as a Context page. Lives in the
 * Dashboards folder (see settings.dashboardsFolder), not under Projects/,
 * so it's never mistaken for a project itself.
 */
export class ProjectsDashboardComposer {
	private fileIO = new FileIO();
	private dashboard = new ProjectsDashboard();

	constructor(private settings: ProjectsDashboardSettings) {}

	async refresh(app: AppLike, path: string): Promise<void> {
		const content = await this.generate(app);
		const file = app.vault.getAbstractFileByPath(path);
		if (!file) return;
		await app.vault.modify(file, content);
	}

	async generate(app: AppLike): Promise<string> {
		const activities: DashboardActivity[] = await loadActivityRecords(
			app, this.settings.activitiesFolder, this.settings.archiveFolder
		);
		const projects = await this.loadProjects(app);
		const rows = this.dashboard.buildRows(activities, projects);
		return this.dashboard.render(rows, this.fileIO.todayDate());
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
