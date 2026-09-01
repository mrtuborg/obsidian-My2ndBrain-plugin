# 2ndBrain Engine Plugin

A TypeScript Obsidian plugin that replaces the CustomJS + DataviewJS automation system. It reacts to `file-open` events and runs processing pipelines for Daily Notes, Activities, and People files in a structured personal knowledge vault.

**Current status: All phases complete and deployed.** The plugin is installed and active at `VaultFolder/.obsidian/plugins/2ndbrain-engine/`.

---

## What it does

- **Daily notes** — generates the canonical header and `### Activities:` section on first open; freezes the note after that. Only runs for today; past notes are recovered from activity history on first open.
- **Planning with `takeToWork`** — every Activity carries a mandatory `takeToWork: true|false` field. It is the single switch deciding whether that activity shows up in today's daily note. You flip it by clicking **Take to work** in the Eisenhower Matrix.
- **Eisenhower Matrix** — a live view (not generated markdown) with editable columns and a take-to-work / drop button per activity.
- **Projects dashboard** — a live view that leads with which projects need a decision, not with row counts.
- **Plan ahead** — set a **Planned** date and the activity takes itself to work on that day, no reminder needed.
- **Activity files** — injects `## Description` from the owning Project file (replace-semantics) and rebuilds `## Journal` using a state-transition algorithm (only records first introduction and completion of each todo — no carry-forward noise).
- **AutoActivityCreator** — scans previous journal entry and all project files for unresolved wikilinks and creates missing Activity files automatically.
- **Past note recovery** — if a past daily note is deleted and recreated (empty), the plugin reconstructs its Activities section from activity Journal history.

---

## Planning model

| Field | Type | What it controls |
|---|---|---|
| `takeToWork` | `true` / `false`, **mandatory** | Whether the activity appears in today's daily note |
| `takeToWorkDate` | `YYYY-MM-DD`, optional | The day you intend to start. When it arrives the activity is taken to work automatically and the field is cleared |
| `stage` | `doing` / `backlog` / `done` | `done` retires the activity from both the matrix and the daily note |
| `remind` | `daily`, `weekdays`, `monday`, `YYYY-MM[-DD]`, … | **Matrix visibility only** — whether the activity is offered for planning today |
| `snoozeUntil` | `YYYY-MM-DD` | **Matrix visibility only** — temporarily hides it from planning |

An activity lands in today's daily note when `takeToWork: true`, `stage != done`, and `startDate <= today`.
`remind` and `snoozeUntil` no longer gate the daily note — they decide what the matrix offers you.

Clicking **Take to work** also sets `stage: doing`; choosing `done` in the **Stage** column clears
`takeToWork`. A `takeToWorkDate` that has arrived takes the activity to work by itself.

Writing a new `[[wikilink]]` in a daily note or Context page creates the activity already taken to work —
the Journal is the source of truth, so jotting it down *is* planning it, and it appears in that same day's
Activities section. Use **Drop** in the matrix to say "captured, but not today". Mentioning an activity that
already exists never changes its flag, so carried-forward notes can't quietly resurrect what you dropped.

Run **2ndBrain: Backfill takeToWork on all activities** once from the command palette to stamp the field
across the vault. It stamps `false` everywhere — a clean slate you plan from — rather than deriving the
value from `stage`, which would silently hand you a day's worth of choices you never made. It is
idempotent and never overwrites a decision you've already recorded.

### The matrix note

`Dashboards/Eisenhower Matrix.md` contains only a fenced block:

````markdown
```2ndbrain-matrix
```
````

The plugin renders the live, editable matrix into it. Each row has:

| Control | Writes |
|---|---|
| **Take to work** / **Drop** | `takeToWork` (taking also sets `stage: doing`) |
| **Planned** date field | `takeToWorkDate` — the day it should take itself to work |
| **Role**, **Project**, **Priority** dropdowns | the matching frontmatter field |
| **Stage** dropdown | `stage` — choosing `done` or `backlog` also clears `takeToWork` |

**Planned** is a one-shot alarm, not a recurring rule. On the day it names, the activity is taken to work
automatically and the date is cleared — so something you plan, then drop, never comes back on its own.
Until that day it only affects the sort order inside a quadrant (soonest first).

### The projects dashboard

`Dashboards/Projects.md` holds a fenced block too:

````markdown
```2ndbrain-projects
```
````

It is built for a periodic review, so it leads with the projects that are asking for something rather than
listing every project alphabetically. Each project gets a status:

| Status | Means |
|---|---|
| **Stalled** | Open work, but nothing dated in the last 60 days |
| **No next action** | Open work, but nothing is in `doing` — there is nothing to pull |
| **Active** | In progress and recently touched |
| **Complete** | Every activity is done |
| **No activities** | Nothing references this project yet |

Inside each role, rows sort by that status — stalled first, most neglected at the top. Projects with no
activities are collapsed into a single foldable line at the bottom instead of filling the page with empty
rows. The **Activities** bar shows the stage mix (done / doing / backlog), the **Today** column counts how
many of the project's activities you have taken to work, and the **Role** dropdown writes `role:` straight
into the project file — useful for anything sitting under *No role*.

### What a button will never do

**Drop**, and moving the **Stage** to `done` or `backlog`, also take the activity back out of today's daily
note and Context pages — but only if nothing is written under it. The moment you type anything beneath an
activity in a daily note, that block is the record of your day and the source of truth: no button, and no
rebuild, will remove it. If you drop an activity you have already written under, it stays in the note and
the plugin says so.

Changing **Priority** moves the row between quadrants. The **Project** list is built from your
`Projects/` folder — subfolders and top-level notes both count — plus anything your activities already
reference. A dropdown always contains the value currently on disk, marked `(unknown)` if it isn't part
of the standard vocabulary, so editing one column never quietly rewrites another.

Every control writes a single frontmatter line on one activity file — the smallest possible write, so two
devices planning different activities never collide in Obsidian Sync.

---

## Plugin development

### Commands

```bash
npm run build   # TypeScript check + esbuild bundle
npm test        # Jest unit tests (445 tests)
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
