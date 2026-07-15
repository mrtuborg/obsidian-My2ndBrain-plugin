import { BlockCollection } from './BlockCollection';
import { Block } from './Block';
import { AttributesProcessor } from './AttributesProcessor';

const DATE_FILE_RE = /(\d{4}-\d{2}-\d{2})$/;
const DATE_TAG_RE = /^\d{4}-\d{2}-\d{2}$/;

interface TodoState {
	text: string;
	firstOpenDate: string | null;
	doneDate: string | null;
}

export class MentionsProcessor {
	private attrProcessor = new AttributesProcessor();

	async run(
		currentPageContent: string,
		blocks: BlockCollection,
		tagId: string,
		frontmatterObj?: Record<string, unknown>
	): Promise<string> {
		if (!blocks || typeof blocks.findByType !== 'function') return '';

		// 1. Collect relevant blocks
		const relevant = blocks.blocks.filter(b => {
			if (b.content.includes(tagId)) return true;
			return this.isBlockUnderSpecificActivityHeader(b, tagId);
		});

		if (relevant.length === 0) return '';

		// 2. Apply directives to frontmatterObj (if provided)
		if (frontmatterObj) {
			for (const block of relevant) {
				if (block.content.includes('{') && block.content.includes('}')) {
					this.attrProcessor.processAttributes(frontmatterObj, block.content);
				}
			}
		}

		// 3. Route by mode:
		//    - Daily-note mode (tagId is a date): collect all cross-references (append)
		//    - Activity mode (tagId is a name):   state-transition algorithm (compact, replace)
		if (DATE_TAG_RE.test(tagId)) {
			return this.buildCrossRefContent(currentPageContent, relevant, tagId);
		} else {
			return this.buildStateTransitionContent(currentPageContent, relevant);
		}
	}

	// ── Activity mode: state-transition ──────────────────────────────────────
	// Only two events matter per todo: when it was introduced and when it was done.
	// Intermediate "still open" carry-forwards are suppressed.

	private buildStateTransitionContent(
		currentPageContent: string,
		relevant: Block[]
	): string {
		// Sort blocks chronologically so we process earliest dates first
		const sorted = [...relevant].sort((a, b) => {
			const da = this.extractDateKey(a.page);
			const db = this.extractDateKey(b.page);
			return da < db ? -1 : da > db ? 1 : 0;
		});

		const todoMap = new Map<string, TodoState>();
		const textItems: Array<{ content: string; date: string }> = [];

		for (const block of sorted) {
			const type = block.getAttribute('type') as string;
			if (type === 'header' || type === 'separator' || type === 'code') continue;

			const dateKey = this.extractDateKey(block.page);
			const content = block.content.trim();
			if (!content) continue;

			if (type === 'todo') {
				const text = content.replace(/^\s*- \[ \]\s*/, '');
				if (!todoMap.has(text)) {
					todoMap.set(text, { text, firstOpenDate: dateKey, doneDate: null });
				}
				// Repeated open mentions of the same todo = no state change, skip

			} else if (type === 'done') {
				const text = content.replace(/^\s*- \[x\]\s*/, '');
				if (!todoMap.has(text)) {
					// First mention is already done
					todoMap.set(text, { text, firstOpenDate: null, doneDate: dateKey });
				} else {
					const state = todoMap.get(text)!;
					// Record first done date (sorted → first occurrence wins)
					if (!state.doneDate) state.doneDate = dateKey;
				}

			} else {
				// Text / mention: deduplicate by content, keep earliest date
				if (!textItems.some(t => t.content === content)) {
					textItems.push({ content, date: dateKey });
				}
			}
		}

		// Build section map: date → lines[]
		const sectionMap = new Map<string, string[]>();
		const addLine = (date: string, line: string) => {
			if (!sectionMap.has(date)) sectionMap.set(date, []);
			sectionMap.get(date)!.push(line);
		};

		for (const { text, firstOpenDate, doneDate } of todoMap.values()) {
			if (firstOpenDate === null && doneDate !== null) {
				addLine(doneDate, `- [x] ${text}`);
			} else if (firstOpenDate !== null && doneDate === null) {
				addLine(firstOpenDate, `- [ ] ${text}`);
			} else if (firstOpenDate !== null && doneDate !== null) {
				if (firstOpenDate === doneDate) {
					addLine(firstOpenDate, `- [x] ${text}`);
				} else {
					addLine(firstOpenDate, `- [ ] ${text}`);
					addLine(doneDate, `- [x] ${text}`);
				}
			}
		}

		for (const { content, date } of textItems) {
			addLine(date, content);
		}

		if (sectionMap.size === 0) return '';

		// Build Journal body (chronological)
		const sortedDates = [...sectionMap.keys()].sort();
		const journalLines: string[] = [];
		for (const date of sortedDates) {
			journalLines.push(`[[${date}]]`);
			journalLines.push(...sectionMap.get(date)!);
			journalLines.push('');
		}

		return this.replaceJournalSection(currentPageContent, journalLines.join('\n').trimEnd());
	}

	// ── Daily-note cross-ref mode: unchanged append behavior ─────────────────

	private buildCrossRefContent(
		currentPageContent: string,
		relevant: Block[],
		tagId: string
	): string {
		const byDate = new Map<string, string[]>();
		for (const block of relevant) {
			const dateKey = this.extractDateKey(block.page);
			if (!byDate.has(dateKey)) byDate.set(dateKey, []);
			const type = block.getAttribute('type') as string;
			if (type === 'header' || type === 'separator') continue;
			const line = block.content.trim();
			if (line) byDate.get(dateKey)!.push(line);
		}

		if (byDate.size === 0) return '';

		const sortedKeys = [...byDate.keys()].sort((a, b) => {
			const da = a.match(/^\d{4}-\d{2}-\d{2}$/) ? a : null;
			const db = b.match(/^\d{4}-\d{2}-\d{2}$/) ? b : null;
			if (da && db) return da < db ? -1 : da > db ? 1 : 0;
			if (da) return -1;
			if (db) return 1;
			return a.localeCompare(b);
		});

		const existingSections = this.parseExistingSections(currentPageContent);
		const journalIdx = this.findJournalEnd(currentPageContent);
		const newSections: string[] = [];

		for (const dateKey of sortedKeys) {
			if (existingSections.has(dateKey)) continue;
			const lines = byDate.get(dateKey)!;
			if (lines.length === 0) continue;
			newSections.push(`[[${dateKey}]]`);
			newSections.push(...lines);
			newSections.push('');
		}

		let updatedContent = this.syncCheckboxes(currentPageContent, relevant, tagId);
		if (newSections.length > 0) {
			updatedContent = this.insertSections(updatedContent, newSections, journalIdx);
		}
		return updatedContent || '';
	}

	// ── Private helpers ──────────────────────────────────────────────────────

	private replaceJournalSection(content: string, newJournalBody: string): string {
		const lines = content.split('\n');
		const journalStart = lines.findIndex(l => /^## Journal\s*$/.test(l));

		if (journalStart === -1) {
			return content.trimEnd() + '\n\n## Journal\n\n' + newJournalBody + '\n\n----\n';
		}

		// Find end of ## Journal section
		let journalEnd = lines.length;
		for (let i = journalStart + 1; i < lines.length; i++) {
			if (/^## /.test(lines[i]!)) { journalEnd = i; break; }
		}

		return [
			...lines.slice(0, journalStart + 1),
			'',
			newJournalBody,
			'',
			'----',
			'',
			...lines.slice(journalEnd),
		].join('\n');
	}

	private isBlockUnderSpecificActivityHeader(block: Block, tagId: string): boolean {
		let current = block.parent;
		while (current) {
			if (current.getAttribute('type') === 'header' && current.content.includes(tagId)) {
				return true;
			}
			current = current.parent;
		}
		return false;
	}

	private extractDateKey(page: string): string {
		const m = page.match(DATE_FILE_RE);
		return m ? m[1]! : page.replace(/^.*\//, '').replace(/\.md$/, '');
	}

	private parseExistingSections(content: string): Set<string> {
		const found = new Set<string>();
		const re = /\[\[(\d{4}-\d{2}-\d{2})\]\]/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(content)) !== null) found.add(m[1]!);
		return found;
	}

	private findJournalEnd(content: string): number {
		const lines = content.split('\n');
		let journalStart = -1;
		for (let i = 0; i < lines.length; i++) {
			if (/^## Journal\s*$/.test(lines[i]!)) { journalStart = i; break; }
		}
		if (journalStart === -1) return -1;
		for (let i = lines.length - 1; i > journalStart; i--) {
			if (/^----\s*$/.test(lines[i]!)) return i;
		}
		return lines.length;
	}

	private insertSections(content: string, sections: string[], beforeLine: number): string {
		if (beforeLine === -1) {
			return content.trimEnd() + '\n\n' + sections.join('\n') + '\n';
		}
		const lines = content.split('\n');
		return [...lines.slice(0, beforeLine), ...sections, ...lines.slice(beforeLine)].join('\n');
	}

	private syncCheckboxes(content: string, blocks: Block[], tagId: string): string {
		const doneTexts = new Set<string>();
		for (const block of blocks) {
			if (block.getAttribute('type') !== 'done') continue;
			if (!block.content.includes(tagId) && !this.isBlockUnderSpecificActivityHeader(block, tagId)) continue;
			const text = block.content.replace(/^\s*- \[x\]\s*/, '').trim();
			if (text) doneTexts.add(text);
		}
		if (doneTexts.size === 0) return content;
		return content.split('\n').map(line => {
			const trimmed = line.trimStart();
			if (!trimmed.startsWith('- [ ] ')) return line;
			const taskText = trimmed.slice('- [ ] '.length).trim();
			return doneTexts.has(taskText) ? line.replace('- [ ] ', '- [x] ') : line;
		}).join('\n');
	}
}
