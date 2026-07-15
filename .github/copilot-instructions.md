# 2ndBrain Engine Plugin

## What this repo is

A TypeScript Obsidian plugin that replaces a CustomJS + DataviewJS automation system.
All 7 implementation phases are **complete and deployed**. 184 tests passing.

## Architecture

```
file-open event
    └── main.ts (router)
         ├── Journal/YYYY-MM-DD.md (any date) → DailyNoteComposer
         │     ├── today:          full pipeline (autoCreate → sync → Activities section)
         │     └── past + empty:   recovery from activity Journal history
         └── Activities/*.md / People/*.md    → ActivityComposer
              ├── projectDescriptionInjector  (## Description, replace-semantics)
              └── mentionsProcessor           (## Journal, state-transition algorithm)
```

Components are in `src/components/`, composers in `src/composers/`, file I/O in `src/utilities/`.

**Rule: Pure logic classes (Block, BlockCollection, NoteBlocksParser, AttributesProcessor) must have zero Obsidian API dependency.** They take strings, return objects.

## Current status (all phases complete)

All components ported from `../Engine/Scripts/`:

| TypeScript | Source JS | Phase |
|---|---|---|
| `src/components/Block.ts` | `components/Block.js` | 1 ✅ |
| `src/components/BlockCollection.ts` | `components/BlockCollection.js` | 1 ✅ |
| `src/components/NoteBlocksParser.ts` | `components/noteBlocksParser.js` | 2 ✅ |
| `src/utilities/FileIO.ts` | `utilities/fileIO.js` | 3 ✅ |
| `src/utilities/ScriptsRemove.ts` | `utilities/scriptsRemove.js` | 3 ✅ |
| `src/components/AttributesProcessor.ts` | `components/attributesProcessor.js` | 3 ✅ |
| `src/components/ProjectDescriptionInjector.ts` | `components/projectDescriptionInjector.js` | 4 ✅ |
| `src/components/MentionsProcessor.ts` | `components/mentionsProcessor.js` | 4 ✅ |
| `src/components/ActivitiesInProgress.ts` | `components/activitiesInProgress.js` | 4 ✅ |
| `src/components/AutoActivityCreator.ts` | `components/autoActivityCreator.js` | 4 ✅ |
| `src/components/TodoSyncManager.ts` | `components/todoSyncManager.js` | 4 ✅ |
| `src/composers/ActivityComposer.ts` | `activityComposer.js` | 5 ✅ |
| `src/composers/DailyNoteComposer.ts` | `dailyNoteComposer.js` | 5 ✅ |

## Data model

| File type | Location | Role |
|---|---|---|
| Daily Note | `Journal/YYYY-MM-DD.md` | Source of truth for tasks |
| Activity | `Activities/*.md` | Derived view — rebuilt from Journal + Projects |
| People | `People/*.md` | Same pipeline as Activity |
| Project | `Projects/*.md` | Read-only source for Activity descriptions |

## Key design decisions

- **D1**: Journal is the temporal truth. `## Journal` content originates only from Journal files.
- **D2**: Projects are the structural truth. `## Description` content originates only from Projects.
- **D3**: Activity files are derived views. Delete and recreate → both sections fully restored.
- **D4**: State-transition algorithm in MentionsProcessor. Only introduction and completion of each todo are recorded. Carry-forward repetitions are suppressed.
- **D5**: Past notes are frozen (not reprocessed) if they already have `### Activities:`. Recovery runs only for empty/fresh past notes.
- **D6**: Each class has one job. Composers orchestrate; components do one step.
- **D7**: No Obsidian API in Block, BlockCollection, NoteBlocksParser, AttributesProcessor.
- **D8**: All folder paths are configurable via settings.
- **D9**: All errors surface as `new Notice(...)` — never silent failures.
- **D10**: Journal+project blocks are parsed ONCE per pipeline run and shared across all sub-steps (performance).

## Build and test

```bash
npm run build    # tsc type check + esbuild bundle
npm test         # Jest unit tests (184 tests)
npm run dev      # watch mode for development
```

Tests live in `tests/`. Test files use Jest mocks — no real vault access.
