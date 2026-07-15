import { Block } from './Block';

export class BlockCollection {
	blocks: Block[];

	constructor() {
		this.blocks = [];
	}

	addBlock(block: Block): void {
		if (this.blocks.includes(block)) return;
		this.blocks.push(block);
	}

	findByType(type: string): Block[] {
		return this.blocks.filter(b => b.isType(type));
	}

	findByAttribute(key: string, value: unknown): Block[] {
		return this.blocks.filter(b => b.getAttribute(key) === value);
	}

	getBlocksByPage(page: string): Block[] {
		return this.blocks.filter(b => b.page === page);
	}

	getRootBlocks(): Block[] {
		return this.blocks.filter(b => b.parent === null);
	}

	getStats(): { total: number; byType: Record<string, number>; pages: number } {
		const byType: Record<string, number> = {};
		const pages = new Set<string>();

		for (const b of this.blocks) {
			const type = b.getAttribute('type') as string | undefined;
			if (type) {
				byType[type] = (byType[type] ?? 0) + 1;
			}
			pages.add(b.page);
		}

		return { total: this.blocks.length, byType, pages: pages.size };
	}

	static createNew(): BlockCollection {
		return new BlockCollection();
	}
}
