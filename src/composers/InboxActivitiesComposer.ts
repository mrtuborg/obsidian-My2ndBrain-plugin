import { AppLike, FileIO } from '../utilities/FileIO';

export interface InboxActivitiesSettings {
	activitiesFolder: string;
	archiveFolder: string;
	projectsFolder: string;
}

const START_MARKER = '<!-- 2ndbrain:inbox-activities:start -->';
const END_MARKER = '<!-- 2ndbrain:inbox-activities:end -->';
const EMPTY_MESSAGE = '✅ Все активные Activity приписаны к проектам.';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface InboxEntry {
	path: string;
	displayName: string;
	startDate: string;
	priority: string;
}

/**
 * Regenerates the auto-generated activity list inside the vault's "Inbox"
 * project file only — replacing the legacy DataviewJS block from the old
 * CustomJS system (which required the Dataview plugin, disabled in this
 * vault, and had a stale `stage === "active"` filter that no longer matches
 * any valid stage).
 *
 * Deliberately scoped to Inbox alone, not every Project file: real projects
 * already get their activity links via the manually-authored `## Activities`
 * blocks that ProjectDescriptionInjector reads (that's the intended
 * "organize an activity" workflow). Inbox is structurally different — it's
 * the not-yet-organized bucket, so nothing is ever manually linked there;
 * an automatic listing is the only way it can show anything at all.
 */
export class InboxActivitiesComposer {
	private fileIO = new FileIO();

	constructor(private settings: InboxActivitiesSettings) {}

	async processProjectFile(app: AppLike, path: string): Promise<void> {
		if (this.slugFor(path).toLowerCase() !== 'inbox') return;

		const fileHandle = app.vault.getAbstractFileByPath(path);
		if (!fileHandle) return;

		const content = await app.vault.read(fileHandle);
		if (this.fileIO.exceedsSizeLimit(content)) return;

		const entries = await this.loadInboxActivities(app);
		const updated = this.inject(content, entries);
		if (updated !== content) await app.vault.modify(fileHandle, updated);
	}

	/** Mirrors ProjectsDashboardComposer's project discovery: top-level
	 * Projects/<slug>.md, or Projects/<slug>/Project.md. Returns '' (never
	 * matches) for any other file, e.g. nested docs like a project's README. */
	private slugFor(path: string): string {
		const folder = this.settings.projectsFolder;
		if (!path.startsWith(folder + '/') || !path.endsWith('.md')) return '';
		const rel = path.slice(folder.length + 1);
		const parts = rel.split('/');
		if (parts.length === 1) return parts[0]!.replace(/\.md$/, '');
		if (parts.length === 2 && parts[1] === 'Project.md') return parts[0]!;
		return '';
	}

	private async loadInboxActivities(app: AppLike): Promise<InboxEntry[]> {
		const { activitiesFolder, archiveFolder } = this.settings;
		const files = app.vault.getFiles().filter(f =>
			f.path.startsWith(activitiesFolder + '/') &&
			!f.path.startsWith(archiveFolder + '/') &&
			f.path.endsWith('.md')
		);

		const entries: InboxEntry[] = [];
		for (const file of files) {
			const handle = app.vault.getAbstractFileByPath(file.path);
			if (!handle) continue;
			const content = await app.vault.read(handle);
			if (this.fileIO.exceedsSizeLimit(content)) continue;

			const projectRaw = (this.fileIO.parseFrontmatterField(content, 'project') ?? '').trim();
			const normalized = projectRaw === '' ? 'inbox' : projectRaw;
			if (normalized.toLowerCase() !== 'inbox') continue;

			const stage = this.fileIO.parseFrontmatterField(content, 'stage') ?? '';
			if (stage === 'done') continue; // only surface open work, like the old query did

			const startDateRaw = this.fileIO.parseFrontmatterField(content, 'startDate') ?? '';
			entries.push({
				path: file.path,
				displayName: file.basename,
				startDate: DATE_RE.test(startDateRaw) ? startDateRaw : '',
				priority: this.fileIO.parseFrontmatterField(content, 'priority') ?? '',
			});
		}

		entries.sort((a, b) => {
			const da = a.startDate || '\uffff';
			const db = b.startDate || '\uffff';
			if (da !== db) return da < db ? -1 : 1;
			return a.displayName.localeCompare(b.displayName);
		});
		return entries;
	}

	private render(entries: InboxEntry[]): string {
		if (entries.length === 0) return EMPTY_MESSAGE;

		const lines = ['| Activity | Started | Priority |', '|---|---|---|'];
		for (const e of entries) {
			const linkPath = e.path.replace(/\.md$/, '');
			lines.push(`| [[${linkPath}\\|${e.displayName}]] | ${e.startDate || '—'} | ${e.priority || '—'} |`);
		}
		return lines.join('\n');
	}

	private inject(content: string, entries: InboxEntry[]): string {
		const block = `${START_MARKER}\n${this.render(entries)}\n${END_MARKER}`;

		const markerRe = new RegExp(
			`${this.escapeRegExp(START_MARKER)}[\\s\\S]*?${this.escapeRegExp(END_MARKER)}`
		);
		if (markerRe.test(content)) return content.replace(markerRe, block);

		// One-time migration: replace the legacy DataviewJS block (from the
		// old CustomJS system) with the native marker block, in place.
		const dataviewRe = /```dataviewjs[\s\S]*?```/;
		if (dataviewRe.test(content)) return content.replace(dataviewRe, block);

		// Neither found — append a new section at the end.
		return content.trimEnd() + '\n\n## Unorganized Activities\n\n' + block + '\n';
	}

	private escapeRegExp(s: string): string {
		return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
