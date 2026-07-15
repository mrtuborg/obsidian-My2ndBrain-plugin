# Plugin TDD Development Plan

**Status: COMPLETED 2026-07-15 — all 7 phases done, 184 tests passing, plugin deployed.**

Date: 2026-07-14
Repo: `obsidian-2ndbrain-plugin/`
Reference: `Engine/Docs/07-test-specifications.md`, `Engine/Docs/09-functional-spec-cornerstones.md`
Behavioral contract: never break what the current DataviewJS system does.

---

## TDD Ground Rules

1. **Red first.** Write the failing test before writing a single line of implementation.
2. **One failing test at a time.** Do not write more tests than you can make pass in one sitting.
3. **No implementation without a failing test.** Every exported function must be covered by at least one test before it ships.
4. **No Obsidian in unit tests.** Unit tests use only plain TypeScript. All Obsidian API calls are injected as dependencies and mocked in tests.
5. **Fixtures are canonical.** Test fixtures in `tests/fixtures/` are the single source of truth for what "correct" content looks like. If a fixture needs to change, update the test spec in `Engine/Docs/07-test-specifications.md` too.
6. **Integration tests are additive.** Integration tests validate full pipelines using the vault mock. They do not replace unit tests.
7. **Port behavior, not code.** When porting a JS component, write the TypeScript interface and tests from the spec, not by reading the JS. The JS is a reference for edge cases only.

---

## Test Infrastructure (pre-Phase-1 requirement)

Before any component work, the test infrastructure must be solid.

### Mock: Obsidian `App`

All Obsidian API calls (`app.vault`, `app.metadataCache`) must be injectable.
Create `tests/__mocks__/obsidian.ts` (already scaffolded, may be incomplete — verify).

Minimum mock surface:
```typescript
interface MockVault {
  read: jest.Mock;        // (file: TFile) => Promise<string>
  modify: jest.Mock;      // (file: TFile, content: string) => Promise<void>
  create: jest.Mock;      // (path: string, content: string) => Promise<TFile>
  createFolder: jest.Mock;
  getAbstractFileByPath: jest.Mock;  // (path: string) => TFile | null
  getFiles: jest.Mock;    // () => TFile[]
}

interface MockMetadataCache {
  getFileCache: jest.Mock; // (file: TFile) => CachedMetadata | null
}

interface MockApp {
  vault: MockVault;
  metadataCache: MockMetadataCache;
}
```

### Fixture files

Location: `tests/fixtures/`

Required files before Phase 2:
```
tests/fixtures/
├── journal/
│   ├── 2026-04-04.md   ← daily note mentioning "My Project"
│   ├── 2026-04-10.md   ← second mention, one task checked
│   └── 2026-02-28.md   ← older mention
├── activities/
│   ├── my-project.md   ← active activity, project type
│   ├── plan-today.md   ← inbox type
│   ├── done-project.md ← stage: done
│   └── future.md       ← startDate in 2099
├── projects/
│   └── Platform.md     ← defines My Project with goal + done-criteria
└── expected/
    ├── activity-after-update.md   ← expected output of activityComposer
    └── daily-note-today.md        ← expected output of dailyNoteComposer
```

### Helper: fixture loader

```typescript
// tests/helpers/fixtures.ts
export function loadFixture(relativePath: string): string {
  return fs.readFileSync(path.join(__dirname, '../fixtures', relativePath), 'utf8');
}
```

---

## Phase 1: Block + BlockCollection

**Goal:** Port the two foundational data classes. Zero Obsidian dependency.

### Step 1.1 — Write tests (RED)

File: `tests/Block.test.ts`

Cover spec cases B-01 through B-06 from `07-test-specifications.md`:
- Create block with page, content, mtime
- Set and get attribute
- `isType()` shortcut
- `addChild()` sets parent
- `addChild()` no duplicates
- `isDescendantOf()` — direct and transitive

File: `tests/BlockCollection.test.ts`

Cover spec cases BC-01 through BC-04:
- Add blocks, retrieve by type
- No duplicates
- `getBlocksByPage()`
- `getRootBlocks()`

Run: `npm test` → all 10 tests RED.

### Step 1.2 — Implement (GREEN)

File: `src/components/Block.ts`

```typescript
export class Block {
  page: string;
  content: string;
  mtime: number;
  attributes: Map<string, unknown>;
  parent: Block | null;
  children: Block[];

  constructor(page: string, content: string, mtime: number) { ... }

  setAttribute(key: string, value: unknown): void { ... }
  getAttribute(key: string): unknown { ... }
  isType(type: string): boolean { ... }
  getLevel(): number { ... }
  addChild(child: Block): void { ... }   // no-op if already child
  setParent(parent: Block): void { ... }
  isDescendantOf(ancestor: Block): boolean { ... }
  getAllDescendants(): Block[] { ... }

  static createNew(page: string, content: string, mtime: number): Block { ... }
}
```

File: `src/components/BlockCollection.ts`

```typescript
export class BlockCollection {
  blocks: Block[];

  addBlock(block: Block): void { ... }      // no-op if already present
  findByType(type: string): Block[] { ... }
  findByAttribute(key: string, value: unknown): Block[] { ... }
  getBlocksByPage(page: string): Block[] { ... }
  getRootBlocks(): Block[] { ... }
  getStats(): { total: number; byType: Record<string, number>; pages: number } { ... }

  static createNew(): BlockCollection { ... }
}
```

Run: `npm test` → all 10 tests GREEN.

### Step 1.3 — Refactor

- Remove any duplication between Block and BlockCollection.
- Verify no Obsidian imports in either file.

**Exit gate:** `npm test` green, zero Obsidian imports in `src/components/Block.ts` and `src/components/BlockCollection.ts`.

---

## Phase 2: noteBlocksParser

**Goal:** Parse markdown text into a BlockCollection. Still no Obsidian dependency in unit tests (content passed as a string).

### Step 2.1 — Write tests (RED)

File: `tests/noteBlocksParser.test.ts`

Cover spec cases NP-01 through NP-11. Key cases:

```
NP-01: isHeader detection matrix
NP-02: isTodoLine detection matrix
NP-03: isDoneLine detection matrix (case-sensitive [x])
NP-04: flat todo list — 3 blocks, correct types
NP-05: header + children — parent set, header.content accumulates
NP-06: separator resets hierarchy — two headers, tasks have different parents
NP-07: two blank lines reset hierarchy — orphan task has null parent
NP-08: indentation hierarchy — 3 levels of nesting
NP-09: code block content ignored for todos
NP-10: mention line detected
NP-11: file date filter — only YYYY-MM-DD files parsed
```

All NP-01 through NP-09 call `parser.parse(page, content)` with a string — no file IO.
NP-11 calls `parser.run(app, pages, "YYYY-MM-DD")` with a mocked app.

### Step 2.2 — Implement (GREEN)

File: `src/components/noteBlocksParser.ts`

Interface:
```typescript
export class NoteBlocksParser {
  // Pure string parsing — no IO
  parse(page: string, content: string): BlockCollection { ... }

  // Line classifiers — all pure functions
  isHeader(line: string): boolean { ... }
  getHeaderLevel(line: string): number { ... }
  isTodoLine(line: string): boolean { ... }
  isDoneLine(line: string): boolean { ... }
  isMention(line: string): boolean { ... }
  isCallout(line: string): boolean { ... }
  isCodeBlock(line: string): boolean { ... }
  getIndentationLevel(line: string): number { ... }

  // Requires Obsidian app — unit-tested with mock
  async run(
    app: App,
    pages: Array<{ file: { path: string; name: string } }>,
    namePattern: string | null
  ): Promise<BlockCollection> { ... }
}
```

Parsing rules to preserve exactly (from JS reference):
1. `----` or `---` → separator block + reset all hierarchy
2. Two consecutive blank lines → reset hierarchy
3. Header block accumulates child content in its own `content` field
4. Indentation stack tracks most recent block at each indentation level
5. Code blocks: content between ` ``` ` markers is NOT parsed for todos

### Step 2.3 — Integration test

File: `tests/noteBlocksParser.integration.test.ts`

Use fixture `tests/fixtures/journal/2026-04-04.md`.
Verify the full structure of blocks produced — count, types, parent relationships.

**Exit gate:** all NP unit and integration tests green.

---

## Phase 3: Utilities

**Goal:** Port `fileIO`, `scriptsRemove`, `attributesProcessor`.

### Step 3.1 — fileIO tests (RED)

File: `tests/fileIO.test.ts`

Cover FIO-01 through FIO-08:
- `todayDate()` format
- `isDailyNote()` — today / past
- `generateActivityHeader()` — valid input output, invalid stage throws, no type field when null
- `extractFrontmatterAndDataviewJs()` — full content splits correctly, no frontmatter case
- `parseFrontmatterField()` — reads scalar, returns null for missing
- `parseExtraFrontmatterFields()` — scalar, inline sequence, block list, empty scalar

For `loadFile` and `saveFile` — mock `app.vault.read` and `app.vault.modify`.

### Step 3.2 — fileIO implement (GREEN)

File: `src/utilities/fileIO.ts`

Critical: `parseFrontmatterField` and `parseExtraFrontmatterFields` must read from
**raw text**, NOT from `app.metadataCache`. This is required by invariant A.3.1
(cache may be stale during re-render).

### Step 3.3 — scriptsRemove tests + implement

File: `tests/scriptsRemove.test.ts`

Cases:
- Content with one dataviewjs block → block removed, rest preserved
- Content with no dataviewjs block → unchanged
- Content with multiple blocks → only the FIRST removed (or all, based on spec)

File: `src/utilities/scriptsRemove.ts`

### Step 3.4 — attributesProcessor tests (RED)

File: `tests/attributesProcessor.test.ts`

Cover AP-01 through AP-07:
- Set string field via `{field: value}`
- Set numeric via `{field = 5}`
- Increment `{score += 2}`
- Decrement `{score -= 1}`
- Advance date `{startDate += 7d}`
- Regress date by weeks `{startDate -= 2w}`
- Directive inside code block is ignored

### Step 3.5 — attributesProcessor implement (GREEN)

File: `src/components/attributesProcessor.ts`

Interface:
```typescript
export class AttributesProcessor {
  processAttributes(
    frontmatter: Record<string, unknown>,
    bodyContent: string
  ): string  // returns updated body (directives converted to comments)
}
```

Input frontmatter is mutated in-place for Standard fields.
Directives in code blocks are skipped.
Processed directive `{x: y}` → `(x: y)` in output content.

**Exit gate:** All FIO, scriptsRemove, AP tests green. Zero runtime Obsidian imports in utility functions (only in methods that take `app` as a parameter).

---

## Phase 4: Mid-pipeline Components

### Phase 4a: projectDescriptionInjector

#### Step 4a.1 — Tests (RED)

File: `tests/projectDescriptionInjector.test.ts`

Cases:
```
PDI-01: Block from Projects/ under Activity header → extracted
PDI-02: Block from Journal/ → ignored
PDI-03: tagId header itself → not copied (header block skipped)
PDI-04: Separator block → skipped
PDI-05: Multiple project sources → concatenated with sub-headings
PDI-06: Existing ## Description replaced (replace-semantics verified)
PDI-07: No matching project blocks → ## Description cleared (empty)
PDI-08: No ## Description section exists → section created before ## Journal
```

#### Step 4a.2 — Implement (GREEN)

File: `src/components/projectDescriptionInjector.ts`

Key invariant: `run()` always injects (even empty string) — this enforces replace-semantics.
Never partially overwrite — always replace from `## Description` to the next `## ` or `----`.

---

### Phase 4b: mentionsProcessor

#### Step 4b.1 — Tests (RED)

File: `tests/mentionsProcessor.test.ts`

Cover MP-01 through MP-08 from test spec:
```
MP-01: Empty collection → ""
MP-02: Direct mention → section with date + todo line
MP-03: Hierarchical mention → child block collected under Activity header
MP-04: Existing section NOT duplicated (append-semantics)
MP-05: New date section created even if task text existed in earlier section
MP-06: Checkbox sync — [x] in journal → [x] in activity output
MP-07: Chronological ordering — oldest section first
MP-08: Directive from journal → frontmatterObj mutation
```

Additional edge cases (from invariants A.1.1, A.1.7):
```
MP-09: tagId matches filename not alias — "Fix WiFi driver" not "Fix WiFi Driver.md"
MP-10: Activity from Archive/ never contributes to another activity's Journal
MP-11: Unicode tagId (Cyrillic) — mentionsProcessor finds mentions correctly (EC-05)
```

#### Step 4b.2 — Implement (GREEN)

File: `src/components/mentionsProcessor.ts`

Interface:
```typescript
export class MentionsProcessor {
  async run(
    currentPageContent: string,
    blocks: BlockCollection,
    tagId: string,
    frontmatterObj?: Record<string, unknown>
  ): Promise<string>
}
```

Matching rules:
- Direct: `block.content.includes(tagId)`
- Hierarchical: block is child of a header whose content includes tagId

Sorting: always chronological (date-named source files oldest-first).
Non-date source files: sorted alphabetically after date files.
Append-semantics: compare source date against existing `[[YYYY-MM-DD]]` sections.
Sync: for every `- [x]` found, update matching `- [ ]` in current content.

---

### Phase 4c: activitiesInProgress

#### Step 4c.1 — Tests (RED)

File: `tests/activitiesInProgress.test.ts`

Cover AIP-01 through AIP-08 from test spec:
```
AIP-01: active activity → appears with open todos
AIP-02: done activity → excluded
AIP-03: future activity → excluded
AIP-04: archived activity → excluded
AIP-05: inbox last
AIP-06: older project before newer project
AIP-07: no open todos → header + separator only
AIP-08: output format exact match
```

Additional from functional spec B.2.5:
```
AIP-09: remind=weekdays → excluded on Saturday
AIP-10: remind=monday → excluded on Friday
AIP-11: todos from ## Description section are NOT included (only ## Journal todos)
AIP-12: completed todo has matching [x] → not shown as open
AIP-13: priority field affects sort order within same type
```

#### Step 4c.2 — Implement (GREEN)

File: `src/components/activitiesInProgress.ts`

Critical: read frontmatter from **raw file content** using `fileIO.parseFrontmatterField()`,
NOT from `app.metadataCache`. This ensures files created moments ago by `autoActivityCreator`
are visible before the cache indexes them (invariant B.1.5).

Sort order (from functional spec B.2.5):
1. type priority: `project=1`, unset=50, `inbox=999`
2. priority: `high=1`, `medium=2`, `low=3`, unset=2
3. startDate ascending
4. filename alphabetical

---

### Phase 4d: todoSyncManager

#### Step 4d.1 — Tests (RED)

File: `tests/todoSyncManager.test.ts`

Cover TSM-01 and TSM-02:
```
TSM-01: active activity file → app.vault.modify called with its path
TSM-02: archived activity → app.vault.modify NOT called
```

Note: in the plugin, `todoSyncManager` does NOT need to trigger DataviewJS re-evaluation
(that was a workaround for the DataviewJS system). Instead, it should directly call
`activityComposer.processActivity()` for each active activity.

**New behavior in plugin vs. JS:**
```
JS:   todoSyncManager touches file → DataviewJS re-runs → activity syncs
Plugin: todoSyncManager calls activityComposer.processActivity() directly
```

Add test:
```
TSM-03: each in-progress activity has processActivity() called before run() returns
```

#### Step 4d.2 — Implement (GREEN)

File: `src/components/todoSyncManager.ts`

---

### Phase 4e: autoActivityCreator

#### Step 4e.1 — Tests (RED)

File: `tests/autoActivityCreator.test.ts`

From functional spec B.2.3 and B.5.10–B.5.12:
```
AAC-01: unresolved [[Activities/Name.md]] → creates Activities/Name.md
AAC-02: resolved link (file exists) → no create call
AAC-03: date link [[2026-04-04]] → skipped
AAC-04: date link [[2026-W14]] → skipped
AAC-05: [[People/Name]] → creates People/Name.md
AAC-06: [[Name]] (no folder) → creates Activities/Name.md
AAC-07: [[Projects/Something]] → skipped
AAC-08: Projects/ source → project field set to "Projects/Name.md"
AAC-09: Journal source → project field set to "inbox"
AAC-10: created file contains standard frontmatter + DataviewJS block + ## Description + ## Journal
AAC-11: parent folder created if missing
AAC-12: file already exists at creation time → no error (idempotent)
```

#### Step 4e.2 — Implement (GREEN)

File: `src/components/autoActivityCreator.ts`

---

**Phase 4 exit gate:** All PDI, MP, AIP, TSM, AAC tests green.
No `cJS()` calls. No `dv.pages()` calls. No DataviewJS dependency anywhere in `src/`.

---

## Phase 5: Composers + Event Router

**Goal:** Wire all components into the two pipelines and connect them to the `file-open` event.

### Step 5.1 — activityComposer tests (RED)

File: `tests/activityComposer.integration.test.ts`

Use fixture: `tests/fixtures/activities/my-project.md`
Use fixture: `tests/fixtures/journal/2026-04-04.md`

Cover AC-01 through AC-04 from test spec:
```
AC-01: frontmatter standard fields preserved
AC-02: new journal mention section added
AC-03: existing content not duplicated (idempotent on second run)
AC-04: dataviewjs block preserved in output
```

Additional invariants:
```
AC-05: Extra frontmatter fields (priority, remind, quality, etc.) preserved unchanged (A.1.6)
AC-06: ## Description populated from Projects/ fixture
AC-07: ## Journal sections in chronological order
AC-08: [x] from journal → [x] in ## Journal section (checkbox sync)
AC-09: stage=done activity → still processed (activityComposer runs for all opens)
```

### Step 5.2 — activityComposer implement (GREEN)

File: `src/composers/activityComposer.ts`

Pipeline (see ENGINE_DESCRIPTION.md §6):
```
fileIO.loadFile()
fileIO.parseFrontmatterField() + parseExtraFrontmatterFields()  ← raw text, not cache
fileIO.generateActivityHeader()
noteBlocksParser.run(journalPages)           ← journal files only
attributesProcessor.processAttributes()
projectDescriptionInjector.run()
mentionsProcessor.run()
fileIO.saveFile()
```

### Step 5.3 — dailyNoteComposer tests (RED)

File: `tests/dailyNoteComposer.integration.test.ts`

Cover DNC-01 through DNC-04 from test spec:
```
DNC-01: today's note → Activities section present
DNC-02: today's note → dataviewjs block removed (static)
DNC-03: past note → Activities section not rebuilt
DNC-04: standard header present in output
```

Additional:
```
DNC-05: future note → no Activities section, dataviewjs preserved
DNC-06: static past note → no modification at all (B.1.6)
DNC-07: autoActivityCreator runs before todoSyncManager before activitiesInProgress (B.1.5)
DNC-08: Activities section order matches sort rules (type → priority → startDate → filename)
```

### Step 5.4 — dailyNoteComposer implement (GREEN)

File: `src/composers/dailyNoteComposer.ts`

Pipeline (see ENGINE_DESCRIPTION.md §5):
```
pageIsToday = (filename === today)

if pageIsToday:
  autoActivityCreator.run()
  todoSyncManager.run()       ← must complete before activitiesInProgress
  activitiesInProgress.run()  ← reads activity files for Activities section

noteBlocksParser.run(journalPages)
mentionsProcessor.run()       ← cross-references from other journal entries

if pageIsToday:
  scriptsRemove.run()         ← freeze note

fileIO.saveFile()
```

### Step 5.5 — main.ts router update

`src/main.ts` currently has stubs. Replace `Notice` placeholders with real calls:

```typescript
if (isJournal && isToday) {
  await dailyNoteComposer.processDailyNote(this.app, file, this.settings);
} else if (isActivity || isPeople) {
  await activityComposer.processActivity(this.app, file, this.settings);
}
```

**Phase 5 exit gate:** Both integration test suites green. Manual smoke test in Obsidian: open an Activity file → `## Journal` updates. Open today's Daily Note → Activities section populated.

---

## Phase 6: Settings Tab

**Goal:** All configurable paths exposed in Obsidian settings UI.

Settings already defined in `src/settings.ts`:
```
journalFolder, activitiesFolder, archiveFolder, peopleFolder, projectsFolder
dateFormat, autoProcessOnOpen, removeScriptsFromDailyNotes
```

### Step 6.1 — Tests

Settings tab has no logic to unit-test. Verify behavior contract:
```
ST-01: DEFAULT_SETTINGS has correct values (already tested in phase0.test.ts)
ST-02: After settings change, plugin reacts to new paths on next file-open
```

ST-02 is a manual integration test (in Obsidian).

### Step 6.2 — Implement

Pass `settings` object through to all components instead of hardcoded folder names.
Every hardcoded `"Activities"`, `"Journal"`, `"Projects"` string in `src/` must come from `settings`.

**Phase 6 exit gate:** Changing `activitiesFolder` in settings changes which folder the engine scans. Verified manually.

---

## Phase 7: Template Cleanup (Cutover)

**Goal:** Remove DataviewJS blocks from note templates. Plugin is now the trigger.

### Prerequisites
- Phase 5 complete and smoke-tested.
- Plugin installed and `autoProcessOnOpen: true`.
- CustomJS, DataviewJS still active (safety net).

### Steps

1. Update `Engine/Templates/Activity-template.md`:
   - Remove the ` ```dataviewjs ... ``` ` block.
   - Keep frontmatter, `## Description`, `## Journal` sections.

2. Update `Engine/Templates/DailyNote-template.md`:
   - Remove the ` ```dataviewjs ... ``` ` block.
   - Keep the header template (`### DD [[...]] [[...]]` etc.)

3. Verify in Obsidian: create a new Activity file → Templater inserts template without script → plugin fires on `file-open` → `## Journal` populated.

4. Verify: create today's Daily Note → plugin fires → Activities section populated → script not re-added.

5. Once verified stable: disable CustomJS and DataviewJS plugins.

### Rollback
If anything breaks, re-enable DataviewJS + CustomJS and restore original templates from git.

**Phase 7 exit gate:** Both template types work without DataviewJS blocks. CustomJS and DataviewJS disabled. System behavior identical to before.

---

## Implementation Sequence Summary

```
Phase 0  ✅ DONE   Scaffold, settings, Jest, file-open stub
Phase 1  ✅ DONE   Block + BlockCollection (10 unit tests)
Phase 2  ✅ DONE   noteBlocksParser (12 unit + 1 integration test)
Phase 3  ✅ DONE   fileIO + scriptsRemove + attributesProcessor (20 unit tests)
Phase 4a ✅ DONE   projectDescriptionInjector (8 unit tests)
Phase 4b ✅ DONE   mentionsProcessor (11 unit tests)
Phase 4c ✅ DONE   activitiesInProgress (13 integration tests)
Phase 4d ✅ DONE   todoSyncManager (3 integration tests)
Phase 4e ✅ DONE   autoActivityCreator (12 unit/integration tests)
Phase 5  ✅ DONE   Composers + event router (13 integration tests + smoke)
Phase 6  ✅ DONE   Settings wired through all components
Phase 7  ✅ DONE   Template cleanup, CustomJS/DataviewJS disabled
```

Total: ~103 test cases defined in the existing spec, covering all components.

---

## Regression Safety Net

After Phase 5, run the following manual regression checklist before every significant change:

```
[ ] Open a new Activity file → ## Journal populated with journal history
[ ] Open an Activity again → no duplication in ## Journal
[ ] Open today's Daily Note → Activities section present
[ ] Open today's Daily Note again → Activities section unchanged (idempotent)
[ ] Mark a task [x] in journal → opens Activity → task shows [x]
[ ] Open yesterday's Daily Note → no Activities section rebuilt
[ ] Create a new Activity link in Journal → tomorrow's daily note creates the file
[ ] Activity with stage: done → NOT in daily note Activities section
[ ] Change a setting → next open uses the new folder path
```

---

## Invariants That Must Never Break (From Spec)

These are the hard lines. If a test would break any of these, fix the implementation.

| ID | Invariant |
|---|---|
| A.1.1 | `## Journal` content originates only from Journal/ files |
| A.1.2 | `## Description` content originates only from Projects/ files |
| A.1.3 | Delete + recreate Activity → both sections fully restored |
| A.1.4 | Engine never writes to Journal files |
| A.1.5 | Engine never writes to Project files |
| A.1.6 | Extra frontmatter fields survive every open/save unchanged |
| A.1.7 | tagId = filename without .md, never alias, never full path |
| B.1.1 | Only today's note gets Activities section |
| B.1.2 | Only today's note has DataviewJS block removed |
| B.1.5 | autoActivityCreator → todoSyncManager → activitiesInProgress (strict order) |
| B.1.6 | A Static past note is never modified |
| B.5.4 | Acceptance criteria tasks (above ## Journal) never appear in Daily Note |
