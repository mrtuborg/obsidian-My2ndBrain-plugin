import { Plugin, TFile, Notice } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, TwoBrainSettingsTab } from './settings';
import { ActivityComposer } from './composers/ActivityComposer';
import { DailyNoteComposer } from './composers/DailyNoteComposer';

export default class TwoBrainPlugin extends Plugin {
	settings: PluginSettings;
	private activityComposer!: ActivityComposer;
	private dailyNoteComposer!: DailyNoteComposer;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new TwoBrainSettingsTab(this.app, this));
		this.rebuildComposers();

		this.addCommand({
			id: 'toggle-vacation-mode',
			name: 'Toggle vacation mode',
			callback: async () => {
				this.settings.vacationMode = !this.settings.vacationMode;
				await this.saveSettings();
				new Notice(
					this.settings.vacationMode
						? '2ndBrain: Vacation mode ON — work activities hidden from daily notes'
						: '2ndBrain: Vacation mode OFF — all activities visible again'
				);
			},
		});

		this.registerEvent(
			this.app.workspace.on('file-open', async (file) => {
				if (!file) return;
				await this.routeFile(file);
			})
		);
	}

	private rebuildComposers() {
		const { settings } = this;
		const composerSettings = {
			journalFolder: settings.journalFolder,
			projectsFolder: settings.projectsFolder,
			activitiesFolder: settings.activitiesFolder,
			archiveFolder: settings.archiveFolder,
			syncGraceSeconds: settings.syncGraceSeconds,
			vacationMode: settings.vacationMode,
		};
		this.activityComposer = new ActivityComposer(composerSettings);
		this.dailyNoteComposer = new DailyNoteComposer(composerSettings);
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
			if (isJournal) {
				// Handles both today (full pipeline) and past dates (recovery/cross-refs)
				await this.dailyNoteComposer.processDailyNote(
					this.app as any, { path: file.path, basename: file.basename }
				);
			} else if (isActivity || isPeople) {
				await this.activityComposer.processActivity(
					this.app as any, { path: file.path }
				);
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
		this.rebuildComposers();
	}
}
