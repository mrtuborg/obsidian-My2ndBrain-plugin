import { App, PluginSettingTab, Setting } from 'obsidian';
import TwoBrainPlugin from './main';

export interface PluginSettings {
	journalFolder: string;
	activitiesFolder: string;
	archiveFolder: string;
	peopleFolder: string;
	projectsFolder: string;
	dateFormat: string;
	autoProcessOnOpen: boolean;
	removeScriptsFromDailyNotes: boolean;
	syncGraceSeconds: number;
	vacationMode: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	journalFolder: 'Journal',
	activitiesFolder: 'Activities',
	archiveFolder: 'Activities/Archive',
	peopleFolder: 'People',
	projectsFolder: 'Projects',
	dateFormat: 'YYYY-MM-DD',
	autoProcessOnOpen: true,
	removeScriptsFromDailyNotes: true,
	syncGraceSeconds: 5,
	vacationMode: false,
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
			.setDesc("Folder containing daily notes (YYYY-MM-DD.md)")
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
			.setName("Auto-process on open")
			.setDesc("Disable to pause all automatic processing")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoProcessOnOpen)
				.onChange(async (value) => {
					this.plugin.settings.autoProcessOnOpen = value;
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

		new Setting(containerEl)
			.setName("Vacation mode")
			.setDesc("Hide Activities tagged `context: work` in their frontmatter from the daily note's Activities section. Personal activities keep showing up. Toggle off when you're back. Also available as the \"2ndBrain: Toggle vacation mode\" command.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.vacationMode)
				.onChange(async (value) => {
					this.plugin.settings.vacationMode = value;
					await this.plugin.saveSettings();
				}));
	}
}
