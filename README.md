# 2ndBrain Engine Plugin

A TypeScript Obsidian plugin that replaces the CustomJS + DataviewJS automation system. It reacts to `file-open` events and runs processing pipelines for Daily Notes, Activities, and People files in a structured personal knowledge vault.

**Current status: All phases complete and deployed.** The plugin is installed and active at `VaultFolder/.obsidian/plugins/2ndbrain-engine/`.

---

## What it does

- **Daily notes** — generates the canonical header and `### Activities:` section on first open; freezes the note after that. Only runs for today; past notes are recovered from activity history on first open.
- **Planning with `takeToWork`** — every Activity carries a mandatory `takeToWork: true|false` field. It is the single switch deciding whether that activity shows up in today's daily note. You flip it by clicking **Take to work** in the Eisenhower Matrix.
- **Eisenhower Matrix** — a live view (not generated markdown) with per-activity buttons: take to work, set a plan date, mark done.
- **Activity files** — injects `## Description` from the owning Project file (replace-semantics) and rebuilds `## Journal` using a state-transition algorithm (only records first introduction and completion of each todo — no carry-forward noise).
- **AutoActivityCreator** — scans previous journal entry and all project files for unresolved wikilinks and creates missing Activity files automatically.
- **Past note recovery** — if a past daily note is deleted and recreated (empty), the plugin reconstructs its Activities section from activity Journal history.

---

## Planning model

| Field | Type | What it controls |
|---|---|---|
| `takeToWork` | `true` / `false`, **mandatory** | Whether the activity appears in today's daily note |
| `takeToWorkDate` | `YYYY-MM-DD`, optional | **Matrix only** — display and sort order. Never affects daily notes |
| `stage` | `doing` / `backlog` / `done` | `done` retires the activity from both the matrix and the daily note |
| `remind` | `daily`, `weekdays`, `monday`, `YYYY-MM[-DD]`, … | **Matrix visibility only** — whether the activity is offered for planning today |
| `snoozeUntil` | `YYYY-MM-DD` | **Matrix visibility only** — temporarily hides it from planning |

An activity lands in today's daily note when `takeToWork: true`, `stage != done`, and `startDate <= today`.
`remind` and `snoozeUntil` no longer gate the daily note — they decide what the matrix offers you.

Clicking **Take to work** also sets `stage: doing`; clicking **✓** sets `stage: done` and clears `takeToWork`.

Writing a new `[[wikilink]]` in a daily note or Context page creates the activity already taken to work —
the Journal is the source of truth, so jotting it down *is* planning it, and it appears in that same day's
Activities section. Use **Drop** in the matrix to say "captured, but not today". Mentioning an activity that
already exists never changes its flag, so carried-forward notes can't quietly resurrect what you dropped.

Activities written before this field existed fall back to `stage === 'doing'` when read, so nothing changes
until you start clicking. Run **2ndBrain: Backfill takeToWork on all activities** from the command palette
to stamp the field everywhere at once; it is idempotent.

### The matrix note

`Dashboards/Eisenhower Matrix.md` contains only a fenced block:

````markdown
```2ndbrain-matrix
```
````

The plugin renders the live, clickable matrix into it. Each button writes a single frontmatter line on one
activity file — the smallest possible write, so two devices planning different activities never collide in
Obsidian Sync.

---

## Plugin development

### Commands

```bash
npm run build   # TypeScript check + esbuild bundle
npm test        # Jest unit tests (364 tests)
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
