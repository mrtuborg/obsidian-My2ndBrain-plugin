import { Block } from './Block';
import { BlockCollection } from './BlockCollection';
import { AppLike } from '../utilities/FileIO';

// Re-export for test imports that reference AppLike from NoteBlocksParser
export type { AppLike };

// Match YYYY-MM-DD exactly.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class NoteBlocksParser {

	// ── Public API ──────────────────────────────────────────────────────────

	/**
	 * Parse a markdown string into a BlockCollection.
	 * Pure function — no Obsidian dependency.
	 */
	parse(page: string, content: string): BlockCollection {
		const collection = BlockCollection.createNew();
		const lines = content.split('\n');

		let currentHeaderBlock: Block | null = null;
		let currentHeaderLevel = 0;
		let currentBlock: Block | null = null;
		let emptyLineCount = 0;
		let inCodeBlock = false;
		let headerStack: Block[] = [];
		let indentationStack: Array<{ block: Block; level: number }> = [];

		const finalizeBlock = (b: Block) => {
			collection.addBlock(b);
		};

		for (const line of lines) {
			const trimmed = line.trim();
			const indentLevel = this.getIndentationLevel(line);

			// ── Code block toggle ─────────────────────────────────────────
			if (this.isCodeBlock(trimmed)) {
				if (inCodeBlock) {
					// Close code block
					if (currentBlock && currentBlock.isType('code')) {
						currentBlock.content += '\n' + line;
						finalizeBlock(currentBlock);
						currentBlock = null;
					}
					inCodeBlock = false;
				} else {
					// Open code block
					if (currentBlock && currentBlock !== currentHeaderBlock) {
						finalizeBlock(currentBlock);
					}
					const codeBlock = Block.createNew(page, line, Date.now());
					codeBlock.setAttribute('type', 'code');
					codeBlock.setAttribute('indentLevel', indentLevel);
					currentBlock = codeBlock;
					inCodeBlock = true;
				}
				emptyLineCount = 0;
				continue;
			}

			// Inside a code block — accumulate content, skip all parsing
			if (inCodeBlock) {
				if (currentBlock) currentBlock.content += '\n' + line;
				continue;
			}

			// ── Separator ─────────────────────────────────────────────────
			if (trimmed === '---' || trimmed === '----') {
				if (currentBlock && currentBlock !== currentHeaderBlock) {
					finalizeBlock(currentBlock);
					currentBlock = null;
				}
				if (currentHeaderBlock) {
					finalizeBlock(currentHeaderBlock);
					currentHeaderBlock = null;
					currentHeaderLevel = 0;
				}
				indentationStack = [];
				headerStack = [];
				emptyLineCount = 0;

				const sep = Block.createNew(page, line, Date.now());
				sep.setAttribute('type', 'separator');
				sep.setAttribute('indentLevel', 0);
				finalizeBlock(sep);
				continue;
			}

			// ── Empty line ────────────────────────────────────────────────
			if (trimmed === '') {
				emptyLineCount++;
				if (emptyLineCount >= 2) {
					if (currentBlock && currentBlock !== currentHeaderBlock) {
						finalizeBlock(currentBlock);
						currentBlock = null;
					}
					if (currentHeaderBlock) {
						finalizeBlock(currentHeaderBlock);
						currentHeaderBlock = null;
						currentHeaderLevel = 0;
					}
					indentationStack = [];
					headerStack = [];
				}
				continue;
			}
			emptyLineCount = 0;

			// ── Header ───────────────────────────────────────────────────
			if (this.isHeader(line)) {
				const newLevel = this.getHeaderLevel(line);

				if (currentBlock && currentBlock !== currentHeaderBlock) {
					finalizeBlock(currentBlock);
					currentBlock = null;
				}
				if (currentHeaderBlock && newLevel <= currentHeaderLevel) {
					finalizeBlock(currentHeaderBlock);
				}

				const headerBlock = Block.createNew(page, line, Date.now());
				headerBlock.setAttribute('type', 'header');
				headerBlock.setAttribute('level', newLevel);
				headerBlock.setAttribute('indentLevel', 0);

				// Wire into header stack
				this.updateHeaderStack(headerStack, headerBlock, newLevel);
				const parentHeader = this.findParentHeader(headerStack, newLevel);
				if (parentHeader) parentHeader.addChild(headerBlock);

				indentationStack = [];
				currentHeaderBlock = headerBlock;
				currentHeaderLevel = newLevel;
				currentBlock = headerBlock;

				finalizeBlock(headerBlock);
				continue;
			}

			// ── Todo / Done ──────────────────────────────────────────────
			if (this.isTodoLine(line) || this.isDoneLine(line)) {
				const type = this.isDoneLine(line) ? 'done' : 'todo';

				if (currentBlock && currentBlock !== currentHeaderBlock) {
					finalizeBlock(currentBlock);
				}

				const taskBlock = Block.createNew(page, line, Date.now());
				taskBlock.setAttribute('type', type);
				taskBlock.setAttribute('indentLevel', indentLevel);

				const parent = this.findParentByIndentation(
					indentationStack, currentHeaderBlock, indentLevel
				);
				if (parent) parent.addChild(taskBlock);

				// Accumulate into current header
				if (currentHeaderBlock) {
					currentHeaderBlock.content += '\n' + line;
				}

				this.updateIndentationStack(indentationStack, taskBlock, indentLevel);
				currentBlock = taskBlock;
				finalizeBlock(taskBlock);
				continue;
			}

			// ── Callout ──────────────────────────────────────────────────
			if (this.isCallout(trimmed)) {
				if (
					currentBlock &&
					currentBlock.isType('callout') &&
					(currentBlock.getAttribute('indentLevel') as number) === indentLevel
				) {
					currentBlock.content += '\n' + line;
				} else {
					if (currentBlock && currentBlock !== currentHeaderBlock) {
						finalizeBlock(currentBlock);
					}
					const callout = Block.createNew(page, line, Date.now());
					callout.setAttribute('type', 'callout');
					callout.setAttribute('indentLevel', indentLevel);

					const parent = this.findParentByIndentation(
						indentationStack, currentHeaderBlock, indentLevel
					);
					if (parent) parent.addChild(callout);

					this.updateIndentationStack(indentationStack, callout, indentLevel);
					currentBlock = callout;
					finalizeBlock(callout);
				}
				if (currentHeaderBlock) currentHeaderBlock.content += '\n' + line;
				continue;
			}

			// ── Plain text / mention ─────────────────────────────────────
			{
				if (currentBlock && currentBlock !== currentHeaderBlock) {
					finalizeBlock(currentBlock);
				}

				const textType = this.isMention(line) ? 'mention' : 'text';
				const textBlock = Block.createNew(page, line, Date.now());
				textBlock.setAttribute('type', textType);
				textBlock.setAttribute('indentLevel', indentLevel);

				const parent = this.findParentByIndentation(
					indentationStack, currentHeaderBlock, indentLevel
				);
				if (parent) parent.addChild(textBlock);

				if (currentHeaderBlock) currentHeaderBlock.content += '\n' + line;

				this.updateIndentationStack(indentationStack, textBlock, indentLevel);
				currentBlock = textBlock;
				finalizeBlock(textBlock);
			}
		}

		// Finalize any trailing open block
		if (currentBlock && currentBlock !== currentHeaderBlock) {
			finalizeBlock(currentBlock);
		}

		return collection;
	}

	/**
	 * Read and parse multiple vault files, optionally filtering by filename pattern.
	 * @param namePattern - if 'YYYY-MM-DD', only files whose name matches are parsed. null = parse all.
	 */
	async run(
		app: AppLike,
		pages: Array<{ file: { path: string; name: string } }>,
		namePattern: string | null
	): Promise<BlockCollection> {
		const merged = BlockCollection.createNew();

		for (const page of pages) {
			// Strip extension so both "2026-04-04" and "2026-04-04.md" pass the date check
			const basename = page.file.name.replace(/\.md$/, '');
			if (namePattern === 'YYYY-MM-DD' && !DATE_RE.test(basename)) {
				continue;
			}

			const fileHandle = app.vault.getAbstractFileByPath(page.file.path);
			if (!fileHandle) continue;

			const content = await app.vault.read(fileHandle as { path: string });
			const col = this.parse(page.file.path, content);
			for (const block of col.blocks) {
				merged.addBlock(block);
			}
		}

		return merged;
	}

	// ── Line classifiers ────────────────────────────────────────────────────

	isHeader(line: string): boolean {
		return /^#{1,6} .+/.test(line);
	}

	getHeaderLevel(line: string): number {
		const m = line.match(/^(#{1,6}) /);
		return m ? m[1]!.length : 0;
	}

	isTodoLine(line: string): boolean {
		return /^\s*- \[ \]/.test(line);
	}

	isDoneLine(line: string): boolean {
		return /^\s*- \[x\]/.test(line);
	}

	isMention(line: string): boolean {
		return /\[\[.+\]\]/.test(line) && !line.trimStart().startsWith('![[');
	}

	isCallout(trimmed: string): boolean {
		return trimmed.startsWith('>') && !this.isTodoLine(trimmed);
	}

	isCodeBlock(trimmed: string): boolean {
		return trimmed.startsWith('```');
	}

	getIndentationLevel(line: string): number {
		const m = line.match(/^(\s*)/);
		return m ? m[1]!.length : 0;
	}

	// ── Private helpers ─────────────────────────────────────────────────────

	private updateHeaderStack(stack: Block[], header: Block, level: number): void {
		// Remove headers of same or lower level (higher or equal #-count)
		while (stack.length > 0 && (stack[stack.length - 1]!.getLevel() >= level)) {
			stack.pop();
		}
		stack.push(header);
	}

	private findParentHeader(stack: Block[], currentLevel: number): Block | null {
		// Parent is the most recent header with a lower level number (higher in hierarchy)
		for (let i = stack.length - 2; i >= 0; i--) {
			if (stack[i]!.getLevel() < currentLevel) return stack[i]!;
		}
		return null;
	}

	private findParentByIndentation(
		stack: Array<{ block: Block; level: number }>,
		currentHeader: Block | null,
		indentLevel: number
	): Block | null {
		// Find the most recent block with a strictly lower indentation level
		for (let i = stack.length - 1; i >= 0; i--) {
			if (stack[i]!.level < indentLevel) return stack[i]!.block;
		}
		return currentHeader;
	}

	private updateIndentationStack(
		stack: Array<{ block: Block; level: number }>,
		block: Block,
		indentLevel: number
	): void {
		// Remove entries with same or deeper indentation
		while (stack.length > 0 && stack[stack.length - 1]!.level >= indentLevel) {
			stack.pop();
		}
		stack.push({ block, level: indentLevel });
	}
}
