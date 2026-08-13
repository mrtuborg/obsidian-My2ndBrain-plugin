import { Plugin, TFile, Notice, FuzzySuggestModal } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, TwoBrainSettingsTab, ROLES, Role } from './settings';
import { ActivityComposer } from './composers/ActivityComposer';
import { DailyNoteComposer } from './composers/DailyNoteComposer';
import { ContextPageComposer } from './composers/ContextPageComposer';
import { AutoActivityCreator } from './components/AutoActivityCreator';
import { contextsFolderForNote, matchContextPagePath, contextPagePath } from './utilities/ContextPaths';

const DAILY_NOTE_ITEM = '📓 Daily Note' as const;
type SwitcherItem = Role | typeof DAILY_NOTE_ITEM;

class ContextRoleSuggestModal extends FuzzySuggestModal<SwitcherItem> {
	constructor(private plugin: TwoBrainPlugin) {
		super(plugin.app);
		this.setPlaceholder("Open today's daily note or a context page…");
	}

	getItems(): SwitcherItem[] {
		return [DAILY_NOTE_ITEM, ...ROLES];
	}

	getItemText(item: SwitcherItem): string {
		return item;
	}

	onChooseItem(item: SwitcherItem): void {
		if (item === DAILY_NOTE_ITEM) {
			void this.plugin.openTodaysDailyNote();
		} else {
			void this.plugin.openTodaysContextPage(item);
		}
	}
}

export default class TwoBrainPlugin extends Plugin {
	settings: PluginSettings;
	private activityComposer!: ActivityComposer;
	private dailyNoteComposer!: DailyNoteComposer;
	private contextPageComposer!: ContextPageComposer;
	private autoCreator = new AutoActivityCreator();
	private contextStatusBarItem!: HTMLElement;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new TwoBrainSettingsTab(this.app, this));
		this.rebuildComposers();

		this.contextStatusBarItem = this.addStatusBarItem();
		this.contextStatusBarItem.addClass('mod-clickable');
		this.contextStatusBarItem.setText('🧭 Context');
		this.registerDomEvent(this.contextStatusBarItem, 'click', () => {
			new ContextRoleSuggestModal(this).open();
		});

		this.addCommand({
			id: 'open-context-page',
			name: "Open today's context page…",
			callback: () => new ContextRoleSuggestModal(this).open(),
		});

		this.registerEvent(
			this.app.workspace.on('file-open', async (file) => {
				if (!file) return;
				await this.routeFile(file);
			})
		);
	}

	/**
	 * Ensures Contexts/<role>/<today>.md exists (creating folders/file as
	 * needed) and opens it. The file-open handler then runs
	 * ContextPageComposer to regenerate its Activities section.
	 */
	async openTodaysContextPage(role: Role): Promise<void> {
		const dailyNote = this.findTodaysDailyNoteFile();
		if (!dailyNote) {
			new Notice("2ndBrain: Open today's daily note first — context pages live right next to it.");
			return;
		}

		this.settings.currentRole = role;
		void this.saveSettings();

		const file = await this.ensureContextPageFile(role, dailyNote);
		if (!file) return;

		await this.app.workspace.getLeaf(false).openFile(file);

		// Also link this context page from today's daily note, in case that
		// note was already built earlier today (frozen) before this page existed.
		try {
			await this.dailyNoteComposer.ensureContextLink(
				this.app as any, { path: dailyNote.path, basename: dailyNote.basename }, role
			);
		} catch (e) {
			console.error('[2ndBrain]', e);
		}
	}

	/**
	 * Finds today's real daily note file, wherever it actually lives under
	 * the journal folder (flat, or nested via a dated Daily Notes folder
	 * format like "Journal/2026/08.August/2026-08-12.md") — never a context
	 * page, even though those share the same YYYY-MM-DD basename.
	 */
	private findTodaysDailyNoteFile(): TFile | null {
		const today = new Date().toISOString().slice(0, 10);
		const journalFolder = this.settings.journalFolder;
		const match = this.app.vault.getFiles().find(f =>
			f.path.startsWith(journalFolder + '/') &&
			f.basename === today &&
			!matchContextPagePath(f.path, journalFolder, ROLES as readonly string[])
		);
		return (match as TFile) ?? null;
	}

	/**
	 * Creates <today's-daily-note-dir>/Contexts/<today>-<role>.md (and its
	 * Contexts folder) if it doesn't exist yet, and returns the file handle.
	 * Shared by openTodaysContextPage() (interactive) and the automatic
	 * post-daily-note prebuild step. `dailyNote` anchors where the sibling
	 * Contexts folder is created — always right next to that specific note.
	 */
	private async ensureContextPageFile(role: Role, dailyNote: TFile): Promise<TFile | null> {
		const today = new Date().toISOString().slice(0, 10);
		const folderPath = contextsFolderForNote(dailyNote.path);
		const path = contextPagePath(folderPath, today, role);

		try {
			if (!this.app.vault.getAbstractFileByPath(folderPath)) {
				await this.app.vault.createFolder(folderPath);
			}
		} catch (e) {
			const msg = (e as Error).message ?? '';
			if (!msg.includes('already exists')) console.error('[2ndBrain]', e);
		}

		let file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		if (!file) {
			try {
				file = await this.app.vault.create(path, '') as TFile;
			} catch (e) {
				const msg = (e as Error).message ?? '';
				if (!msg.includes('already exists')) {
					new Notice(`2ndBrain: Could not create ${path} — ${msg}`);
					console.error('[2ndBrain]', e);
					return null;
				}
				file = this.app.vault.getAbstractFileByPath(path) as TFile;
			}
		}
		return file;
	}

	/**
	 * Proactively creates/refreshes today's Contexts pages for every role
	 * that has at least one qualifying activity, right after the daily note
	 * itself is built — so context pages are ready before the user ever
	 * switches to them, instead of being lazily built on first visit.
	 * `dailyNote` is the note that was just opened/processed — its own
	 * directory anchors where the sibling Contexts folder is created.
	 */
	private async prebuildContextPages(dailyNote: TFile): Promise<void> {
		let roles: Set<string>;
		try {
			roles = await this.dailyNoteComposer.rolesToPrebuild(this.app as any);
		} catch (e) {
			console.error('[2ndBrain] rolesToPrebuild failed:', e);
			return;
		}

		for (const role of roles) {
			if (!(ROLES as readonly string[]).includes(role)) continue;
			try {
				const file = await this.ensureContextPageFile(role as Role, dailyNote);
				if (!file) continue;
				await this.contextPageComposer.processContextPage(
					this.app as any, { path: file.path }, role
				);
			} catch (e) {
				console.error(`[2ndBrain] prebuild context page failed for ${role}:`, e);
			}
		}
	}

	/**
	 * Opens today's daily note if it already exists (searched at any nesting
	 * depth under the journal folder — e.g. a dated Daily Notes folder
	 * format). Doesn't create one: this plugin doesn't know your Daily Notes
	 * folder-format template, so guessing a path risks creating a stray
	 * duplicate instead of the note your Daily Notes setup would use.
	 */
	async openTodaysDailyNote(): Promise<void> {
		const file = this.findTodaysDailyNoteFile();
		if (!file) {
			new Notice("2ndBrain: Today's daily note doesn't exist yet — create it via Obsidian's Daily notes command first.");
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private rebuildComposers() {
		const { settings } = this;
		const composerSettings = {
			journalFolder: settings.journalFolder,
			projectsFolder: settings.projectsFolder,
			activitiesFolder: settings.activitiesFolder,
			archiveFolder: settings.archiveFolder,
			syncGraceSeconds: settings.syncGraceSeconds,
		};
		this.activityComposer = new ActivityComposer(composerSettings);
		this.dailyNoteComposer = new DailyNoteComposer(composerSettings);
		this.contextPageComposer = new ContextPageComposer(composerSettings);
	}

	/**
	 * Infers which role (if any) a brand-new Activity/People file should be
	 * tagged with, by checking whether today's plain daily note or any of
	 * today's Contexts/YYYY-MM-DD-<Role>.md pages currently link to it.
	 * Needed because Obsidian's native "create note from an unresolved link
	 * click" flow opens the newly-created target file directly — routeFile
	 * has no other way to know which page the link was actually clicked
	 * from. Returns '' (blank, for manual fill-in) when the link was typed
	 * in the plain daily note, or no matching page is found.
	 */
	private async findLinkingRole(targetPath: string): Promise<string> {
		const dailyNote = this.findTodaysDailyNoteFile();
		if (!dailyNote) return '';

		try {
			const folderPath = contextsFolderForNote(dailyNote.path);
			const today = new Date().toISOString().slice(0, 10);
			for (const role of ROLES) {
				const path = contextPagePath(folderPath, today, role);
				const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
				if (!file) continue;
				const content = await this.app.vault.read(file);
				if (this.autoCreator.contentLinksTo(content, targetPath)) return role;
			}
		} catch (e) {
			console.error('[2ndBrain] findLinkingRole failed:', e);
		}
		return '';
	}

	private async routeFile(file: TFile) {
		if (!this.settings.autoProcessOnOpen) return;

		const { settings } = this;
		const today = new Date().toISOString().slice(0, 10);
		const contextRole = this.matchContextPage(file);
		const isJournal = !contextRole &&
			file.path.startsWith(settings.journalFolder + '/') &&
			/^\d{4}-\d{2}-\d{2}$/.test(file.basename);
		const isActivity = file.path.startsWith(settings.activitiesFolder + '/') &&
			!file.path.startsWith(settings.archiveFolder + '/');
		const isPeople = file.path.startsWith(settings.peopleFolder + '/');

		try {
			if (contextRole) {
				await this.contextPageComposer.processContextPage(
					this.app as any, { path: file.path }, contextRole
				);
			} else if (isJournal) {
				// Prebuild context pages first so the daily note's link-line
				// picks up all of today's roles in the same pass, instead of
				// needing a second open to catch up.
				if (file.basename === today) {
					await this.prebuildContextPages(file);
				}
				// Handles both today (full pipeline) and past dates (recovery/cross-refs)
				await this.dailyNoteComposer.processDailyNote(
					this.app as any, { path: file.path, basename: file.basename }
				);
			} else if (isActivity || isPeople) {
				// A blank file here means Obsidian just created it from an
				// unresolved wikilink click (native behavior) rather than via
				// AutoActivityCreator's Journal scan — give it the same
				// default frontmatter before the composer requires startDate.
				// Figure out which role (if any) it was linked from, so it
				// doesn't need a manual role: fill-in when clicked from a
				// Context page.
				const linkingRole = await this.findLinkingRole(file.path);
				await this.autoCreator.initializeIfEmpty(
					this.app as any, file.path, today, 'inbox', linkingRole
				);
				await this.activityComposer.processActivity(
					this.app as any, { path: file.path }
				);
			}
		} catch (e) {
			new Notice(`2ndBrain: Error processing ${file.name} — ${(e as Error).message}`);
			console.error('[2ndBrain]', e);
		}
	}

	/** Matches .../Contexts/<Role>/YYYY-MM-DD.md (at any nesting depth) and returns the role, or null. */
	private matchContextPage(file: TFile): Role | null {
		return matchContextPagePath(file.path, this.settings.journalFolder, ROLES as readonly string[]) as Role | null;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<PluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

