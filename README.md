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

### Development phases

| Phase | Goal | Status |
|-------|------|--------|
| 0 | Scaffold: build, Jest, settings | ✅ Done |
| 1 | Block + BlockCollection + unit tests | ✅ Done |
| 2 | noteBlocksParser + unit tests | ✅ Done |
| 3 | fileIO, scriptsRemove, attributesProcessor | ✅ Done |
| 4 | All mid-pipeline components | ✅ Done |
| 5 | Composers + event router wired | ✅ Done |
| 6 | Settings wired through all components | ✅ Done |
| 7 | Template cleanup, CustomJS/DataviewJS disabled | ✅ Done |

---

## This repo is also a learning project

All LLM engineering study materials live in `learning/`. The driver doc is `learning/LLM-LEARNING-ROADMAP.md` — start there.

---

## This repo is also a learning project

The plugin is the **practice vehicle** for learning LLM-augmented engineering. All study materials live in `learning/`.

### Where to start

**One doc drives everything: `learning/LLM-LEARNING-ROADMAP.md`**

The others are references it points to. You never need to open them cold.

```
LLM-LEARNING-ROADMAP.md        ← DRIVER. Work through this top to bottom.
        │
        ├── consults ──► LLM-BEST-PRACTICES.md       (open when a module says "read §X.Y")
        ├── consults ──► LLM-ENGINEERING-STACK.md    (open when a module says "read Part X")
        ├── deploys  ──► DRAFT-copilot-instructions-roomboard.md  (Module 1.1 action)
        ├── explains ──► NOTE-large-file-llm-workflow.md          (Level 4 background)
        │
        └── READ ONCE (already done, don't re-read):
             COPILOT-INTERACTION-ANALYSIS.md   ← your baseline is already in the Roadmap
             COPILOT-WORKFLOW-ANALYSIS.md
             DOCS-TRUST-AUDIT.md               ← archive, ignore
             scripts/                          ← re-run monthly to track progress
```

### First 30 minutes

1. Open `learning/LLM-LEARNING-ROADMAP.md` — read "Your Baseline" and "Practice Vehicle" sections (~60 lines)
2. Do **Module 1.1** — open a fresh Copilot session in this repo, type `What do you know about this project?`
3. That's it for today. One module per session.

### Daily habit

```
Open Roadmap → find first [ ] → read LEARN → do DO → run VERIFY → mark [✓] → close
```

Don't skip ahead. Don't open reference docs without the Roadmap pointing you there.

### Learning docs

| File | Purpose | When to open |
|------|---------|--------------|
| `LLM-LEARNING-ROADMAP.md` | 7-level personal curriculum | Every session — it's the driver |
| `LLM-BEST-PRACTICES.md` | Interaction patterns reference | When Roadmap points to it |
| `LLM-ENGINEERING-STACK.md` | Tools and architecture reference | When Roadmap points to it |
| `COPILOT-INTERACTION-ANALYSIS.md` | Personal session analysis (323 sessions) | Read once, already summarized in Roadmap |
| `DRAFT-copilot-instructions-roomboard.md` | Ready-to-deploy context file | Module 1.1 |
| `NOTE-large-file-llm-workflow.md` | Large data processing guide | Level 4 |
| `scripts/` | Session analysis scripts | Re-run monthly |

---

## Plugin development

### Commands

```bash
npm run build   # TypeScript check + esbuild bundle
npm test        # Jest unit tests
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
         ├── Journal/YYYY-MM-DD.md (today only) → composers/dailyNoteComposer.ts
         └── Activities/*.md / People/*.md      → composers/activityComposer.ts
```

Full design docs: `../Engine/Plugin/` (01-goals through 06-development-plan).

### Development phases

| Phase | Goal | Status |
|-------|------|--------|
| 0 | Scaffold: build, Jest, settings | ✅ Done |
| 1 | Block + BlockCollection + unit tests | [ ] |
| 2 | noteBlocksParser + unit tests | [ ] |
| 3 | fileIO, scriptsRemove, attributesProcessor | [ ] |
| 4 | All mid-pipeline components | [ ] |
| 5 | Composers + event router wired | [ ] |
| 6 | Settings tab complete | [ ] |
| 7 | Template cleanup, CustomJS disabled | [ ] |
