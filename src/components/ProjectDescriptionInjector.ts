import { BlockCollection } from './BlockCollection';

export class ProjectDescriptionInjector {

	async run(
		contentAfterDataview: string,
		projectBlocks: BlockCollection,
		tagId: string
	): Promise<string> {
		if (!projectBlocks || typeof projectBlocks.findByType !== 'function') {
			return contentAfterDataview;
		}

		const descriptionContent = this.buildDescription(projectBlocks, tagId) ?? '';
		return this.injectIntoDescription(contentAfterDataview, descriptionContent);
	}

	// ── Private ──────────────────────────────────────────────────────────────

	private buildDescription(projectBlocks: BlockCollection, tagId: string): string | null {
		const byProject = new Map<string, string[]>();

		for (const block of projectBlocks.blocks) {
			if (!this.isDescriptionBlock(block, tagId)) continue;

			const projectFile = this.extractProjectFilename(block.page);
			if (!byProject.has(projectFile)) byProject.set(projectFile, []);

			const content = block.content?.trim() ?? '';
			if (content) byProject.get(projectFile)!.push(content);
		}

		if (byProject.size === 0) return null;

		const lines: string[] = [];
		if (byProject.size === 1) {
			const [, blockLines] = [...byProject.entries()][0]!;
			lines.push(...blockLines);
		} else {
			for (const [projectFile, blockLines] of byProject.entries()) {
				lines.push(`###### ${projectFile}`);
				lines.push(...blockLines);
				lines.push('');
			}
		}

		return lines.join('\n');
	}

	private isDescriptionBlock(block: import('./Block').Block, tagId: string): boolean {
		const page = block.page ?? '';
		if (!page.startsWith('Projects/')) return false;

		const blockType = block.getAttribute('type') as string | undefined;
		if (blockType === 'separator') return false;

		// Skip the activity header itself
		if (blockType === 'header' && block.content.includes(tagId)) return false;

		return this.isBlockUnderActivityHeader(block, tagId);
	}

	private isBlockUnderActivityHeader(
		block: import('./Block').Block,
		tagId: string
	): boolean {
		let current = block.parent;
		while (current) {
			if (current.getAttribute('type') === 'header' && current.content.includes(tagId)) {
				return true;
			}
			current = current.parent;
		}
		return false;
	}

	private extractProjectFilename(page: string): string {
		return (page ?? '')
			.replace(/^.*\//, '')
			.replace(/\.md$/, '');
	}

	private injectIntoDescription(content: string, descriptionContent: string): string {
		const lines = content.split('\n');

		const descStart = lines.findIndex(l => /^## Description\s*$/.test(l));
		const journalStart = lines.findIndex(l => /^## Journal\s*$/.test(l));

		if (descStart !== -1) {
			// Find where ## Description ends
			let descEnd = lines.length;
			for (let i = descStart + 1; i < lines.length; i++) {
				if (/^## /.test(lines[i]!) || /^----\s*$/.test(lines[i]!)) {
					descEnd = i;
					break;
				}
			}

			const newLines = [
				...lines.slice(0, descStart + 1),
				'',
				...(descriptionContent ? [descriptionContent] : []),
				'',
				...lines.slice(descEnd),
			];
			return newLines.join('\n');
		}

		// Insert before ## Journal (or prepend)
		const insertAt = journalStart !== -1 ? journalStart : 0;
		const newLines = [
			...lines.slice(0, insertAt),
			'## Description',
			'',
			...(descriptionContent ? [descriptionContent] : []),
			'',
			'----',
			'',
			...lines.slice(insertAt),
		];
		return newLines.join('\n');
	}
}
