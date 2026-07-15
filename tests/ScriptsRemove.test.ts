import { ScriptsRemove } from '../src/utilities/ScriptsRemove';

describe('ScriptsRemove.run', () => {
	const sr = new ScriptsRemove();

	it('removes a standalone dataviewjs block, returning empty string', async () => {
		const block = '```dataviewjs\nconst x = 1;\n```';
		const result = await sr.run(block);
		expect(result.trim()).toBe('');
	});

	it('strips dataviewjs block from content that contains other text', async () => {
		const content = [
			'Some content before',
			'```dataviewjs',
			'const activityComposer = await cJS();',
			'```',
			'Some content after',
		].join('\n');

		const result = await sr.run(content);
		expect(result).toContain('Some content before');
		expect(result).toContain('Some content after');
		expect(result).not.toContain('```dataviewjs');
		expect(result).not.toContain('activityComposer');
	});

	it('returns content unchanged when no dataviewjs block exists', async () => {
		const content = 'Plain content with no scripts';
		const result = await sr.run(content);
		expect(result).toContain('Plain content with no scripts');
		expect(result).not.toContain('```dataviewjs');
	});

	it('handles empty string input', async () => {
		const result = await sr.run('');
		expect(result).toBe('');
	});

	it('does not remove non-dataviewjs code blocks', async () => {
		const content = '```javascript\nconsole.log("hi");\n```';
		const result = await sr.run(content);
		expect(result).toContain('```javascript');
	});
});
