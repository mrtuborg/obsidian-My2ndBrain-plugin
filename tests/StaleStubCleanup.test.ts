import { isStaleAutoCreatedStub, cleanupStaleAutoCreatedStubs, StaleStubAppLike } from '../src/utilities/StaleStubCleanup';

const STALE_STUB = `---
startDate: 2026-07-16
stage: backlog
responsible: [Me]
priority: not-urgent-important
remind: weekdays
type: project
project: platform
---

## Description

Some description text injected from the project.

## Journal

----
`;

const REAL_ACTIVITY = `---
startDate: 2026-07-16
stage: doing
responsible: [Me]
priority: not-urgent-important
remind: weekdays
type: project
project: platform
---

## Description

Some description text.

## Journal

- [x] did the thing

----
`;

describe('isStaleAutoCreatedStub', () => {
	it('matches the exact bug signature: 2026-07-16 + backlog + type:project + empty Journal', () => {
		expect(isStaleAutoCreatedStub(STALE_STUB)).toBe(true);
	});

	it('does not match a real activity with the same date but populated Journal', () => {
		expect(isStaleAutoCreatedStub(REAL_ACTIVITY)).toBe(false);
	});

	it('does not match files from a different startDate', () => {
		const other = STALE_STUB.replace('2026-07-16', '2026-07-20');
		expect(isStaleAutoCreatedStub(other)).toBe(false);
	});

	it('does not match files with stage other than backlog', () => {
		const other = STALE_STUB.replace('stage: backlog', 'stage: doing');
		expect(isStaleAutoCreatedStub(other)).toBe(false);
	});
});

describe('cleanupStaleAutoCreatedStubs', () => {
	function makeApp(files: Record<string, string>): StaleStubAppLike {
		return {
			vault: {
				getFiles: () => Object.keys(files).map(path => ({ path, name: path.slice(path.lastIndexOf('/') + 1) })),
				getAbstractFileByPath: (path: string) => ({ path }),
				read: async (file: any) => files[file.path],
				delete: jest.fn(async () => {}),
			},
		};
	}

	it('deletes only files matching the stale stub signature, via vault.delete()', async () => {
		const files = {
			'Activities/Bogus.md': STALE_STUB,
			'Activities/Real.md': REAL_ACTIVITY,
		};
		const app = makeApp(files);

		const result = await cleanupStaleAutoCreatedStubs(app, 'Activities');

		expect(result.deleted).toEqual(['Activities/Bogus.md']);
		expect(app.vault.delete).toHaveBeenCalledTimes(1);
	});

	it('ignores files outside the activities folder', async () => {
		const files = {
			'Projects/Bogus.md': STALE_STUB,
		};
		const app = makeApp(files);

		const result = await cleanupStaleAutoCreatedStubs(app, 'Activities');

		expect(result.deleted).toEqual([]);
	});
});
