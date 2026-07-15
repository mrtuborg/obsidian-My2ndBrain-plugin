# 2ndBrain Engine Plugin

A TypeScript Obsidian plugin that replaces the CustomJS + DataviewJS automation system. It reacts to `file-open` events and runs processing pipelines for Daily Notes, Activities, and People files in a structured personal knowledge vault.

**Current status: All phases complete and deployed.** The plugin is installed and active at `VaultFolder/.obsidian/plugins/2ndbrain-engine/`.

---

## What it does

- **Daily notes** — generates the canonical header and `### Activities:` section on first open; freezes the note after that. Only runs for today; past notes are recovered from activity history on first open.
- **Activity files** — injects `## Description` from the owning Project file (replace-semantics) and rebuilds `## Journal` using a state-transition algorithm (only records first introduction and completion of each todo — no carry-forward noise).
- **AutoActivityCreator** — scans previous journal entry and all project files for unresolved wikilinks and creates missing Activity files automatically.
- **Past note recovery** — if a past daily note is deleted and recreated (empty), the plugin reconstructs its Activities section from activity Journal history.

---

## Plugin development

### Commands

```bash
npm run build   # TypeScript check + esbuild bundle
npm test        # Jest unit tests (184 tests)
npm run dev     # Watch mode for development
npm run lint    # ESLint
```

### Installing in Obsidian

Copy `main.js`, `manifest.json`, `styles.css` to your vault:
```
VaultFolder/.obsidian/plugins/2ndbrain-engine/
```
Enable in Obsidian → Settings → Community Plugins.

### Architecture

```
file-open event
    └── src/main.ts (router)
         ├── Journal/YYYY-MM-DD.md (any date) → composers/DailyNoteComposer.ts
         │     ├── today: full pipeline (autoCreate → sync → Activities section)
         │     └── past + empty: recovery from activity Journal history
         └── Activities/*.md / People/*.md   → composers/ActivityComposer.ts
              ├── projectDescriptionInjector (## Description, replace-semantics)
              └── mentionsProcessor (## Journal, state-transition algorithm)
```
