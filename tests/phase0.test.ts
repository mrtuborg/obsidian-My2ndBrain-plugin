// Phase 0 smoke test — verifies Jest is wired correctly.
// No Obsidian dependency. Remove this file after Phase 1 tests exist.
describe('Phase 0 sanity', () => {
  it('Jest runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('DEFAULT_SETTINGS has correct journalFolder', () => {
    const { DEFAULT_SETTINGS } = require('../src/settings');
    expect(DEFAULT_SETTINGS.journalFolder).toBe('Journal');
  });
});
