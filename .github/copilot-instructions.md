# 2ndBrain Engine Plugin

## What this repo is

A TypeScript Obsidian plugin that replaces a CustomJS + DataviewJS automation system. It reacts to `file-open` events and runs processing pipelines for Daily Notes, Activities, and People files in a structured personal knowledge vault.

**This is a migration project, not a greenfield design.** The behavior is defined by the legacy JS system. Do not invent new behaviors.

## Architecture

```
file-open event
    └── main.ts (router)
         ├── Journal/YYYY-MM-DD.md (today only) → dailyNoteComposer
         └── Activities/*.md / People/*.md      → activityComposer
```

Components are in `src/components/`, composers in `src/composers/`, file I/O in `src/utilities/`.

**Rule: Pure logic classes (Block, BlockCollection, noteBlocksParser, attributesProcessor) must have zero Obsidian API dependency.** They take strings, return objects. This is what makes them testable.

## Current status (Phase 0 complete)

- `src/main.ts` — plugin entry point + file-open router (skeleton, composers not yet wired)
- `src/settings.ts` — PluginSettings interface + settings tab
- `tests/phase0.test.ts` — Jest smoke test
- `tests/__mocks__/obsidian.ts` — Obsidian API stub for Jest

**Phases 1–7 not yet started.** No component has been ported from JavaScript yet.

## Reference: legacy JS source

All source behavior lives in `../Engine/Scripts/`:
- `components/Block.js` → port to `src/components/Block.ts` (Phase 1)
- `components/BlockCollection.js` → `src/components/BlockCollection.ts` (Phase 1)
- `components/noteBlocksParser.js` → `src/components/noteBlocksParser.ts` (Phase 2)
- `utilities/fileIO.js` → `src/utilities/fileIO.ts` (Phase 3)
- `utilities/scriptsRemove.js` → `src/utilities/scriptsRemove.ts` (Phase 3)
- `components/attributesProcessor.js` → `src/components/attributesProcessor.ts` (Phase 3)
- `components/projectDescriptionInjector.js` → Phase 4
- `components/mentionsProcessor.js` → Phase 4
- `components/activitiesInProgress.js` → Phase 4
- `components/autoActivityCreator.js` → Phase 4
- `components/todoSyncManager.js` → Phase 4
- `dailyNoteComposer.js` → Phase 5
- `activityComposer.js` → Phase 5

Full design docs: `../Engine/Plugin/` (01-goals, 02-system-spec, 03-architecture, 04-design, 05-test-scenarios, 06-development-plan)

## Data model

| File type | Location | Role |
|-----------|----------|------|
| Daily Note | `Journal/YYYY-MM-DD.md` | Source of truth for tasks and progress |
| Activity | `Activities/*.md` | Derived view — rebuilt from Journal + Projects |
| People | `People/*.md` | Same pipeline as Activity |
| Project | `Projects/*.md` | Read-only source for Activity descriptions |

Daily note mention block format:
```markdown
##### [[Activities/ActivityName.md|ActivityName]]
- [ ] Open task
----
```

## Key design decisions (do not change without asking)

- **D5**: Only TODAY's daily note is processed on open. Past notes are frozen.
- **D6**: Each class has one job. Composers orchestrate; components do one step.
- **D7**: No Obsidian API in Block, BlockCollection, noteBlocksParser, attributesProcessor.
- **D8**: All folder paths are configurable via settings with defaults matching the legacy system.
- **D9**: All errors surface as `new Notice(...)` banners — never silent failures.

## Known bug to fix (not preserve)

`activityComposer.js` does not call `projectDescriptionInjector`. The plugin must fix this: the Activity pipeline must call `projectDescriptionInjector` first (per spec B2).

## Build and test

```bash
npm run build    # tsc type check + esbuild bundle
npm test         # Jest unit tests
npm run dev      # watch mode for development
```

Tests live in `tests/`. Test files must use fixtures from `tests/fixtures/` — no real vault access in tests.

## One component per session rule

When porting a JS component to TypeScript:
1. Read the source JS file first
2. Identify the public interface (inputs/outputs)
3. Port ONE component per session
4. Write the unit test in the same session
5. Build must pass before ending the session
