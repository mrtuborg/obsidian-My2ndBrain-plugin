import { App, Modal, Setting } from 'obsidian';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(offsetDays = 0): string {
	const d = new Date();
	d.setDate(d.getDate() + offsetDays);
	return d.toISOString().slice(0, 10);
}

/**
 * Small date picker for the Eisenhower Matrix "plan this activity" button.
 * Resolves with the chosen YYYY-MM-DD, `''` to clear the plan date, or
 * `null` when the user dismisses the modal without deciding.
 */
export class PlanDateModal extends Modal {
	private value: string;
	private resolved = false;
	private resolve!: (value: string | null) => void;

	constructor(app: App, private activityName: string, currentValue: string) {
		super(app);
		this.value = DATE_RE.test(currentValue) ? currentValue : '';
	}

	openAndGetValue(): Promise<string | null> {
		return new Promise(resolve => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: `Plan "${this.activityName}"` });
		contentEl.createEl('p', {
			text: 'The plan date is shown and sorted in the matrix only — it never decides what appears in a daily note.',
			cls: 'setting-item-description',
		});

		new Setting(contentEl)
			.setName('Plan date')
			.addText(text => {
				text.inputEl.type = 'date';
				text.setValue(this.value);
				text.onChange(v => { this.value = v.trim(); });
			});

		new Setting(contentEl)
			.addButton(b => b.setButtonText('Today').onClick(() => this.finish(isoDate(0))))
			.addButton(b => b.setButtonText('Tomorrow').onClick(() => this.finish(isoDate(1))))
			.addButton(b => b.setButtonText('Clear').onClick(() => this.finish('')))
			.addButton(b => b
				.setButtonText('Save')
				.setCta()
				.onClick(() => this.finish(DATE_RE.test(this.value) ? this.value : '')));
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) {
			this.resolved = true;
			this.resolve(null);
		}
	}

	private finish(value: string): void {
		this.resolved = true;
		this.resolve(value);
		this.close();
	}
}
