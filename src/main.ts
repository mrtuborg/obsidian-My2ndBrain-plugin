import { Plugin, TFile, Notice } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, TwoBrainSettingsTab } from './settings';

export default class TwoBrainPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new TwoBrainSettingsTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('file-open', async (file) => {
				if (!file) return;
				await this.routeFile(file);
			})
		);
	}

	private async routeFile(file: TFile) {
		if (!this.settings.autoProcessOnOpen) return;

		const { settings } = this;
		const today = new Date().toISOString().slice(0, 10);
		const isJournal = file.path.startsWith(settings.journalFolder + '/') &&
			/^\d{4}-\d{2}-\d{2}$/.test(file.basename);
		const isToday = isJournal && file.basename === today;
		const isActivity = file.path.startsWith(settings.activitiesFolder + '/') &&
			!file.path.startsWith(settings.archiveFolder + '/');
		const isPeople = file.path.startsWith(settings.peopleFolder + '/');

		try {
			if (isJournal && isToday) {
				// Phase 5: dailyNoteComposer.processDailyNote(this.app, file, settings)
				new Notice('[2ndBrain] Daily note processing — not yet implemented');
			} else if (isActivity || isPeople) {
				// Phase 5: activityComposer.processActivity(this.app, file, settings)
				new Notice('[2ndBrain] Activity processing — not yet implemented');
			}
		} catch (e) {
			new Notice(`2ndBrain: Error processing ${file.name} — ${(e as Error).message}`);
			console.error('[2ndBrain]', e);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<PluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
