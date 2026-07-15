export class Block {
	page: string;
	content: string;
	mtime: number;
	attributes: Map<string, unknown>;
	parent: Block | null;
	children: Block[];

	constructor(page: string, content: string, mtime: number) {
		this.page = page;
		this.content = content;
		this.mtime = mtime;
		this.attributes = new Map();
		this.parent = null;
		this.children = [];
	}

	setAttribute(key: string, value: unknown): void {
		this.attributes.set(key, value);
	}

	getAttribute(key: string): unknown {
		return this.attributes.get(key);
	}

	isType(type: string): boolean {
		return this.getAttribute('type') === type;
	}

	getLevel(): number {
		return (this.getAttribute('level') as number) || 0;
	}

	addChild(child: Block): void {
		if (this.children.includes(child)) return;
		this.children.push(child);
		child.parent = this;
	}

	setParent(parent: Block): void {
		if (this.parent && this.parent !== parent) {
			this.parent.children = this.parent.children.filter(c => c !== this);
		}
		this.parent = parent;
		if (!parent.children.includes(this)) {
			parent.children.push(this);
		}
	}

	isDescendantOf(ancestor: Block): boolean {
		let current = this.parent;
		while (current !== null) {
			if (current === ancestor) return true;
			current = current.parent;
		}
		return false;
	}

	getAllDescendants(): Block[] {
		const result: Block[] = [];
		for (const child of this.children) {
			result.push(child);
			result.push(...child.getAllDescendants());
		}
		return result;
	}

	static createNew(page: string, content: string, mtime: number): Block {
		return new Block(page, content, mtime);
	}
}
