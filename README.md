# 2ndBrain Engine Plugin

A TypeScript Obsidian plugin that replaces the CustomJS + DataviewJS automation system. It reacts to `file-open` events and runs processing pipelines for Daily Notes, Activities, and People files in a structured personal knowledge vault.

**Current status: All phases complete and deployed.** The plugin is installed and active at `VaultFolder/.obsidian/plugins/2ndbrain-engine/`.

---

## What it does

- **Daily notes** — generates the canonical header and `### Activities:` section on first open; freezes the note after that. Only runs for today; past notes are recovered from activity history on first open.
- **Planning with `takeToWork`** — every Activity carries a mandatory `takeToWork: true|false` field. It is the single switch deciding whether that activity shows up in today's daily note. You flip it by clicking **Take to work** in the Eisenhower Matrix.
- **Eisenhower Matrix** — a live view (not generated markdown) with editable columns and a take-to-work / drop button per activity.
- **Projects dashboard** — a live view that leads with which projects need a decision, not with row counts.
- **Home** — a one-glance landing page (`Home.md`): role balance, system health, and where to go next. Fits a phone screen in landscape.
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

### The people dashboard

`Dashboards/People.md` holds a fenced block too:

````markdown
```2ndbrain-people
```
````

It answers two questions from the same journal scan: **who are you actually in touch with**, and
**what did you promise them**.

The first needs nothing from you. Every `[[Person]]` link already in `Journal/**/*.md` counts as a
day of contact, so the page has real content the moment you open it — how many days each person
has come up, when you last wrote about them, and who has gone silent.

The second is opt-in, via two inline tags on an ordinary todo line:

```markdown
- [ ] Send the BOM @owed [[Ida Haugland]]
- [ ] Radio spec @waiting [[Frederik Stray]]
```

| Tag | Meaning | Dashboard label |
|---|---|---|
| `@owed` | I owe them | **I owe** |
| `@waiting` | They owe me | **Waiting on** |

Only the Journal is scanned — Activities and People pages mirror journal content, so reading them
too would double-count every commitment. The promise half **starts empty** and fills as you use
the tags; until then the page shows a one-line reminder of the syntax and gets on with reporting
contact history.

**Not everything in `People/` is a person.** The folder accumulates iteration notes, overviews and
meeting minutes, and a stale `[[People/EELS-W33-iteration]]` link in an old daily note would
otherwise become a row. Names containing a digit or a dot are rejected, as is anything reading as
*overview*, *index*, *template*, *dashboard*, *iteration*, *meeting*, *backlog*, *planning* or
*deliveries* — and the `People/Meetings/` subfolder is skipped entirely.

**Person resolution**, tried in order: a person link on the line itself, then a person link on the
nearest enclosing heading (the `### Topic [[Person]]` pattern already used in this vault), then —
if neither names anyone — the commitment is kept and shown under **Unassigned** rather than
dropped. A line naming two people is one commitment owed to both. Both bare links (`[[Frederik
Stray]]`) and folder-qualified links (`[[People/Frederik Stray]]`, `[[People/Archive/...]]`)
resolve; a bare link only matches an existing page, so mentioning someone who has no People page
yet always shows up under **Mentioned but no page**, with a one-click create button — the actual
fix for a People folder that has gone dark.

**Age, not deadlines.** There is no due-date syntax. A commitment is born on the date of the daily
note it first appears in; carrying it forward on later days doesn't reset that. Its age is
`today − born`, and a person's status is the oldest thing they're waiting on:

| Status | Means |
|---|---|
| **Aging** | Has a commitment open past the aging threshold (14 days) |
| **Open** | Has open commitments, none aging yet |
| **Quiet** | Came up on 2+ days, silent for 60, page not archived |
| **Active** | Mentioned within the last 60 days, nothing outstanding |
| **Dormant** | Archived, never mentioned, or a single passing mention long ago |

**Quiet needs a history to lapse from.** Someone named once eighteen months ago is a name that came
up, not a relationship that went cold, so two days of contact are required before silence is
reported — otherwise the list fills with one-offs and the genuine lapses are lost in it. Archived
people are never called quiet: filing them was the decision, and the dashboard doesn't second-guess
it.

The table is split into **Outstanding**, **Gone quiet** and **In touch**, with everyone else folded
away — three questions in the order a review asks them, rather than one undifferentiated list whose
sort order has to be inferred.

Checking a commitment off writes `[x]` back onto the exact matched line in the daily note — the
journal stays the source of truth, so this is precisely the edit you'd make by hand. If that line
has changed since the dashboard last scanned (edited, reordered), the write is abandoned and the
note opens instead, rather than risk touching the wrong line.

Journal scanning is mtime-cached (per file, persisted in the plugin's data), so re-opening the
dashboard only re-reads notes that changed since the last scan — the same budget rule Home
depends on (below).

### Home

`Home.md` (vault root) holds a fenced ` ```2ndbrain-home ` block. Open it with **2ndBrain: Open home** —
the note is created on first open.

It is deliberately **not** a third dashboard. The matrix already answers *what do I do today* and the
projects view answers *what needs a decision*; repeating either here would only add a second place to read
the same rows. Home answers the question neither one does — **am I balanced across my roles, and is the
system healthy** — then hands off with a link. Everything is counts and chips, never tables, so the whole
page is readable in one glance in landscape on a phone.

| Section | Shows |
|---|---|
| Banner | Greeting, today's date, and how many activities you have taken to work out of everything open |
| Role cards | Per role: `taken / open`, a bar for the share you committed to today, and a badge counting that role's projects needing a decision. The name links to today's Context page when it exists |
| Health signals | Only what is actually wrong — stalled projects, projects with no next action, untriaged activities, activities with no role, promises aging, people gone quiet. Each chip links to the note that resolves it. When nothing fires it says so instead of showing zeroes |
| People | The communication checklist — see below. Unconditional: the health signals above only fire when something is wrong, and a good week must not make relationships disappear from Home, because that is exactly when a drift starts |
| Life balance | A radar with an axis per role, showing how many days each one showed up in your journal over the last 12 months. Normalized against your busiest role, so the shape reads as balance rather than volume — round is even, a spike is a year spent on one thing. A dashed ring marks your own average |
| Consistency | A year of days, one cell each, shaded by how full the day was relative to your typical day. Current streak, longest streak, and total active days. Click any day to open it |
| Next steps | Today's note, Plan (matrix), Projects, People, Inbox — plus the last few days for a glance back |

A role card is highlighted only when it owns open work and **none of it** is planned for today. A role with
nothing open is *clear*, not neglected, and recedes instead of nagging.

Both charts are built from file metadata alone — the date in a journal filename, which role Context pages
sit beside it, and the note's size on disk. Nothing is re-read, so a year of history costs nothing to draw.
Today's note missing doesn't break the streak; at 9am you simply haven't written it yet.

**Opening it on startup.** *Settings → 2ndBrain Engine → Open home on startup* has three positions: leave
your workspace alone, open Home and focus it, or open Home and close everything else. It's a plugin
setting rather than a saved workspace layout, so it follows the vault to every device it syncs to —
including your phone. It runs once the workspace has finished restoring, so it can't race Obsidian putting
yesterday's tabs back and then lose focus to them.

Home never creates anything. If today's daily note or a role's Context page doesn't exist yet, it shows a
plain label rather than a link — creating those stays owned by opening them directly.

### The communication checklist

The one section of Home you can act on. Everything else reports; this closes a loop without leaving the
page.

Each contact is a row: how long since you last spoke, any promises open in either direction, a checkbox,
and buttons for where they sit. Rows are ordered by **longest silence first** — someone you have never
written about ranks above everyone. Past *Settings → 2ndBrain Engine → Reach out after* (30 days by
default) the age turns amber. **Every active contact is shown** — the list is sorted by silence, so a cap
would hide precisely the people you have neglected longest. You shorten it by filing people, not by
folding them.

**Checking someone off** appends `- Talked to [[Name]]` to the end of today's daily note. Nothing is
stamped on their page: the journal is the temporal truth (D1) and a People page's `## Journal` section is
regenerated on every open (D3), so a date written there would be erased. Because the line is a link, the
same journal scan that feeds the People dashboard reads it straight back — one number, one source, no new
store. Unchecking removes that exact line and nothing else; a sentence you wrote yourself that happens to
name the same person is left alone. If today's note doesn't exist yet the checkbox is disabled, since Home
never creates anything.

**Filing someone** moves them between three states:

| State | Means | Effect |
|---|---|---|
| Active | In the rotation | On the checklist, chased when they go quiet |
| Inactive | Not right now | Behind a fold, never flagged as overdue or drifting |
| Archived | Done | Behind a fold, never flagged |

Inactive and archived are folded away — the point of filing someone is that you stop seeing them. Unfold
the section and the **Activate** button on their row puts them straight back. The fold remembers whether it was
open, so restoring the third name out of twelve doesn't slam the list shut.

This is stored as a `contactStatus` field in the person's frontmatter, not by moving the file. Renaming a
page rewrites every journal link pointing at it — which is the very history the checklist reads. People
already filed under `People/Archive/` are treated as archived without needing the field, and an explicit
field outvotes the folder, so they can be brought back like anyone else.

Filing someone is also a statement the rest of the plugin honours: an inactive or archived contact stops
counting toward the "people gone quiet" health signal and the People dashboard's *Gone quiet* section. You
said their silence was fine; continuing to raise it would be the plugin arguing with you.


## Theme

`theme/` holds **Zen 2ndBrain**, an Obsidian theme that gives the whole vault one palette instead of
letting the plugin's views look like a separate tool bolted onto someone else's colours.

Install it by copying `theme/` to `<Vault>/.obsidian/themes/Zen 2ndBrain/`, then pick it under
**Settings → Appearance → Themes**.

**Colour.** Warm stone and sage: paper rather than white, ink rather than black, and one desaturated
green as the only accent. Nothing is fully saturated — in a system you look at every day, saturation is a
budget, and it's spent on the two or three states that genuinely have to interrupt you (overdue, stalled).
Everything is defined through Obsidian's own variables, so the matrix and projects views — which already
read `--text-normal`, `--color-green` and friends — pick the palette up with no changes. Home reads a
small set of `--tb-*` tokens the theme defines, and falls back to its own literals under any other theme.

**Type.** System fonts only. `-apple-system` resolves to SF Pro on macOS and iOS, `ui-monospace` to SF
Mono — both already installed, hinted for those exact screens, and identical on a phone with nothing to
sync. `-apple-system` also switches between SF Pro Text and Display by size, which no webfont can do.
Body sits at 16px/1.62 over a 40rem measure (~68 characters), and every surface uses tabular figures so
counts in a column line up and a changing number doesn't shuffle the layout beside it.

Two things to check after switching:

- **Settings → Appearance → Monospace font** — clear it if it's set, or it overrides the theme's SF Mono.
- The `headers-size` CSS snippet sets its own heading scale and will win over the theme's. Disable it
  unless you want it to.

## Plugin development

### Commands

```bash
npm run build   # TypeScript check + esbuild bundle
npm test        # Jest unit tests (629 tests)
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
