export class ScriptsRemove {
	async run(content: string): Promise<string> {
		return this.removeScripts(content);
	}

	private removeScripts(content: string): string {
		const lines = content.split('\n');
		let inDataviewBlock = false;
		const kept: string[] = [];

		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('```dataviewjs')) {
				inDataviewBlock = true;
				continue;
			}
			if (inDataviewBlock && trimmed === '```') {
				inDataviewBlock = false;
				continue;
			}
			if (!inDataviewBlock) {
				kept.push(line);
			}
		}

		// Filter empty-only lines left over at edges, but preserve internal content
		return kept.join('\n').trim();
	}
}
