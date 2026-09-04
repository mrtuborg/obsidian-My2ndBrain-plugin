import { buildContextLinksLine, upsertContextLinksLine } from '../src/utilities/ContextLinks';

describe('ContextLinks', () => {
	describe('buildContextLinksLine', () => {
		it('returns empty string when no roles are given', () => {
			expect(buildContextLinksLine('Journal/Contexts', '2026-08-12', [])).toBe('');
		});

		it('builds a single wikilink for one role', () => {
			const line = buildContextLinksLine('Journal/Contexts', '2026-08-12', ['Engineer']);
			expect(line).toBe('🧭 Contexts: [[Journal/Contexts/2026-08-12-Engineer|Engineer]]');
		});

		it('joins multiple roles with a middle dot', () => {
			const line = buildContextLinksLine('Journal/Contexts', '2026-08-12', ['Engineer', 'Family']);
			expect(line).toBe(
				'🧭 Contexts: [[Journal/Contexts/2026-08-12-Engineer|Engineer]] · [[Journal/Contexts/2026-08-12-Family|Family]]'
			);
		});
	});

	describe('upsertContextLinksLine', () => {
		it('inserts the line at the top when content has no title', () => {
			const result = upsertContextLinksLine('Some body text', 'LINE');
			expect(result).toBe('LINE\n\nSome body text');
		});

		it('inserts the line right after a leading "# " title', () => {
			const result = upsertContextLinksLine('# My Title\n\nBody', 'LINE');
			expect(result).toBe('# My Title\n\nLINE\n\nBody');
		});

		it('replaces an existing line in place, unchanged position', () => {
			const content = 'Intro\n🧭 Contexts: [[old]]\nMore text';
			const result = upsertContextLinksLine(content, '🧭 Contexts: [[new]]');
			expect(result).toBe('Intro\n🧭 Contexts: [[new]]\nMore text');
		});

		it('removes an existing line when the new line is empty', () => {
			const content = 'Intro\n🧭 Contexts: [[old]]\nMore text';
			const result = upsertContextLinksLine(content, '');
			expect(result).toBe('Intro\nMore text');
		});

		it('is a no-op when there is nothing to remove', () => {
			const content = 'Intro\nMore text';
			const result = upsertContextLinksLine(content, '');
			expect(result).toBe(content);
		});

		it('never duplicates the line across repeated calls', () => {
			let content = 'Intro\nBody';
			content = upsertContextLinksLine(content, '🧭 Contexts: [[a]]');
			content = upsertContextLinksLine(content, '🧭 Contexts: [[a]] · [[b]]');
			const matches = content.match(/🧭 Contexts:/g) ?? [];
			expect(matches.length).toBe(1);
			expect(content).toContain('[[a]] · [[b]]');
		});
	});
});
