import { App, PluginSettingTab, Setting } from 'obsidian';
import TwoBrainPlugin from './main';
import { ROLES, Role } from './roles';
import { CommitmentCache } from './utilities/CommitmentIndex';

export { ROLES };
export type { Role };


/**
 * What should be on screen when Obsidian finishes starting.
 *  - 'off'   — whatever you had open, untouched.
 *  - 'focus' — Home opens and takes focus, your other tabs stay put.
 *  - 'only'  — Home is the only tab; everything else is closed.
 */
export type HomeStartupMode = 'off' | 'focus' | 'only';

export interface PluginSettings {
	journalFolder: string;
	activitiesFolder: string;
	archiveFolder: string;
	peopleFolder: string;
	projectsFolder: string;
	dashboardsFolder: string;
	dateFormat: string;
	autoProcessOnOpen: boolean;
	openHomeOnStartup: HomeStartupMode;
	removeScriptsFromDailyNotes: boolean;
	syncGraceSeconds: number;
	// Last role picked from the status bar — used only to preselect the picker.
	currentRole: Role | null;
	/**
	 * Cached parse of journal promises (@owed/@waiting), keyed by file mtime.
	 * Not user-facing — persisted purely so the People dashboard and Home
	 * don't have to re-read every journal note on each render.
	 */
	commitmentCache?: CommitmentCache;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	journalFolder: 'Journal',
	activitiesFolder: 'Activities',
	archiveFolder: 'Activities/Archive',
	peopleFolder: 'People',
	projectsFolder: 'Projects',
	dashboardsFolder: 'Dashboards',
	dateFormat: 'YYYY-MM-DD',
	autoProcessOnOpen: true,
	// Off by default: taking over startup is the user's call, not the plugin's.
	openHomeOnStartup: 'off',
	removeScriptsFromDailyNotes: true,
	syncGraceSeconds: 5,
	currentRole: null,
};

export class TwoBrainSettingsTab extends PluginSettingTab {
	plugin: TwoBrainPlugin;

	constructor(app: App, plugin: TwoBrainPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "2ndBrain Engine Settings" });

		new Setting(containerEl)
			.setName("Journal folder")
			.setDesc("Folder containing daily notes (YYYY-MM-DD.md). Contexts pages (per-role dated pages) always live in a \"Contexts\" subfolder right next to it.")
			.addText(text => text
				.setPlaceholder("Journal")
				.setValue(this.plugin.settings.journalFolder)
				.onChange(async (value) => {
					this.plugin.settings.journalFolder = value || DEFAULT_SETTINGS.journalFolder;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Activities folder")
			.addText(text => text
				.setPlaceholder("Activities")
				.setValue(this.plugin.settings.activitiesFolder)
				.onChange(async (value) => {
					this.plugin.settings.activitiesFolder = value || DEFAULT_SETTINGS.activitiesFolder;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Archive folder")
			.setDesc("Activity files here are skipped by the engine")
			.addText(text => text
				.setPlaceholder("Activities/Archive")
				.setValue(this.plugin.settings.archiveFolder)
				.onChange(async (value) => {
					this.plugin.settings.archiveFolder = value || DEFAULT_SETTINGS.archiveFolder;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("People folder")
			.addText(text => text
				.setPlaceholder("People")
				.setValue(this.plugin.settings.peopleFolder)
				.onChange(async (value) => {
					this.plugin.settings.peopleFolder = value || DEFAULT_SETTINGS.peopleFolder;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Projects folder")
			.addText(text => text
				.setPlaceholder("Projects")
				.setValue(this.plugin.settings.projectsFolder)
				.onChange(async (value) => {
					this.plugin.settings.projectsFolder = value || DEFAULT_SETTINGS.projectsFolder;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Dashboards folder")
			.setDesc("Where the auto-generated dashboards live: Projects.md (per-project rollup) and Eisenhower Matrix.md (activities by urgency/importance). Regenerated every time you open them.")
			.addText(text => text
				.setPlaceholder("Dashboards")
				.setValue(this.plugin.settings.dashboardsFolder)
				.onChange(async (value) => {
					this.plugin.settings.dashboardsFolder = value || DEFAULT_SETTINGS.dashboardsFolder;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Auto-process on open")
			.setDesc("Disable to pause all automatic processing")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoProcessOnOpen)
				.onChange(async (value) => {
					this.plugin.settings.autoProcessOnOpen = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Open home on startup")
			.setDesc(
				"Show the Home landing page when Obsidian starts. Set to off to leave " +
				"startup alone and keep whatever you had open. Applies on every device " +
				"the vault syncs to."
			)
			.addDropdown(drop => drop
				.addOption('off', 'Off — keep my open tabs')
				.addOption('focus', 'Open home and focus it')
				.addOption('only', 'Open home and close everything else')
				.setValue(this.plugin.settings.openHomeOnStartup)
				.onChange(async (value) => {
					this.plugin.settings.openHomeOnStartup = value as HomeStartupMode;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Sync grace period")
			.setDesc("Seconds to wait before processing a fresh daily note, giving Obsidian Sync time to deliver a version from another device. Set to 0 to disable.")
			.addText(text => text
				.setPlaceholder("5")
				.setValue(String(this.plugin.settings.syncGraceSeconds))
				.onChange(async (value) => {
					const n = parseInt(value, 10);
					this.plugin.settings.syncGraceSeconds = isNaN(n) || n < 0 ? 0 : n;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Remove scripts from daily notes")
			.setDesc("Strip DataviewJS blocks from notes on save")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.removeScriptsFromDailyNotes)
				.onChange(async (value) => {
					this.plugin.settings.removeScriptsFromDailyNotes = value;
					await this.plugin.saveSettings();
				}));
	}
}
