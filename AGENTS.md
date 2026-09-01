# 2ndBrain Engine Plugin

## What this repo is

A TypeScript Obsidian plugin that replaces a CustomJS + DataviewJS automation system. It reacts to `file-open` events and runs processing pipelines for Daily Notes, Activities, and People files in a structured personal knowledge vault.

**All 7 implementation phases are complete.** 511 tests passing. Plugin is deployed and active.

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

Components are in `src/components/`, composers in `src/composers/`, file I/O in `src/utilities/`. UI
(code-block views, modals) lives in `src/ui/`, one-shot migrations in `src/commands/`.

## Planning model: `takeToWork`

Every Activity carries a **mandatory** `takeToWork: true|false` frontmatter field. It is the single gate
deciding whether the activity is rendered into today's daily note.

| Field | Owner | Effect |
|---|---|---|
| `takeToWork` | user, via matrix button | Daily note inclusion. Mandatory on every Activity |
| `takeToWorkDate` | user, via the matrix's inline date field | A one-shot alarm: on that day the activity is auto-taken to work and the date is cleared |
| `remind`, `snoozeUntil` | user, hand-written | **Matrix visibility only.** They no longer gate the daily note |

Rules that must not drift:

- Daily note gate (`ActivitiesInProgress`) = `takeToWork` && `stage != done` && valid `startDate <= today`.
- `TodoSyncManager` is deliberately **not** gated on `takeToWork`. It writes journal todos *into* activity
  files — that is data integrity, not display. Gating it there silently loses Journal entries.
- A missing `takeToWork` resolves to `stage === 'doing'` (`resolveTakeToWork` in `src/utilities/TakeToWork.ts`)
  so a pre-backfill vault still renders something, but the **backfill deliberately does not use that rule**:
  it stamps `false` everywhere. Migrating "every doing activity" to `true` reproduces exactly the behaviour
  this field exists to replace, and hands the user a day they never planned.
- Taking an activity to work also sets `stage: doing`. Setting stage to `done` or `backlog` from the matrix
  dropdown clears `takeToWork` (both mean "not today"); setting it to `doing` leaves the flag alone, because
  working on something and planning it for today are separate decisions.
- Matrix dropdowns (`src/utilities/MatrixOptions.ts`) always include the value currently on disk, labelled
  `(unknown)` when it is outside the standard vocabulary. A `<select>` that omitted it would rewrite that
  field the moment the user changed any other column in the row.
- Activities born from a journal wikilink (`AutoActivityCreator`) start `takeToWork: true`. The Journal is
  the source of truth, so writing `[[Something]]` in a daily note or Context page *is* the act of taking it
  to work — and the stub must appear in the very Activities section that created it. Anything else would
  also contradict the `stage: doing` those stubs are born with.
- That applies to **creation only**. An existing activity is never re-flagged by being mentioned again,
  otherwise yesterday's carried-forward journal would silently resurrect everything the user dropped.
- The matrix is a live view rendered from a ```` ```2ndbrain-matrix ```` code block, not generated markdown —
  static tables cannot carry buttons. `EisenhowerMatrixComposer.refresh` only installs the block if absent.
- The Projects dashboard works the same way (```` ```2ndbrain-projects ````, `ProjectsView`). It answers
  *which projects need a decision*, not *how many activities each one has*: `ProjectsDashboard` computes a
  `health` per project (`stalled` / `no-next-action` / `active` / `complete` / `empty`) and sorts by it
  inside each role, most-neglected first. Projects with no activities are folded into one collapsed line —
  in a real vault they outnumber the rest and a screen of `0/0 (0%)` rows carries no review signal.
- The per-project bar is a stage **mix** (done/doing/backlog), so it always fills its track. Its column is
  therefore labelled "Activities", never "Progress" — an untouched project with one `doing` activity would
  otherwise look finished.
- `takeToWorkDate` fires through `PlanDateActivation`, run before the Activities section is built and again
  on every matrix render. It **always clears the date**. A date left in the frontmatter would re-take the
  activity on every render, making it impossible to drop for as long as the date stayed in the past. A
  `done` activity has its stale date cleared but is never revived.
- Home (```` ```2ndbrain-home ````, `HomeView`, `HomeComposer` installing `Home.md`) is **not** a third
  dashboard and must not grow into one. It renders no tables and repeats no rows from the matrix or the
  projects view — it reports role balance and system health, then links out. The hard constraint is that
  the whole page stays readable in one glance in landscape on a phone (~780x360); anything that needs a
  table belongs in one of the other two views. `tests/HomeView.test.ts` asserts no table is ever emitted.
- A role card warns only when `open > 0 && taken === 0`. A role with nothing open is *clear*, not
  neglected — warning on it would train the user to ignore the warning colour.
- Home never creates a daily note or Context page — it links to one only if it already exists, else renders
  a plain non-clickable label. Creation stays owned by the daily-note pipeline and the open commands, which
  know the nested-folder conventions.
- Home runs its own calm palette (`--zen-*`, scoped to `.twobrain-home`) rather than the sharper accent
  colours the other views use — it is the page opened first, and it should read as a quiet room. The banner
  is an inline SVG data-URI, not a binary asset: no file to ship, no licence to track, and it recolours for
  the dark theme.
- `loadProjectRecords` (`utilities/ProjectIndex.ts`) is the one place the `Projects/<slug>.md` vs
  `Projects/<slug>/Project.md` resolution lives; `ProjectsView` and `HomeView` both use it.
- `theme/` is the Zen 2ndBrain Obsidian theme, shipped alongside the plugin but installed separately (it
  goes to `.obsidian/themes/`, not `.obsidian/plugins/`). It exists so the plugin's views and the rest of
  the vault share one palette. The matrix and projects views already use Obsidian's standard variables, so
  they inherit it for free — **keep it that way**: a hardcoded colour in a view is a colour the theme can
  no longer unify.
- Home is the exception, because its calm palette predates the theme. Its `--zen-*` values now read
  `var(--tb-*, <literal>)`, so the theme drives them when installed and the literals keep Home correct
  under any other theme. New Home colours must follow the same two-level pattern.
- The theme is system-font only on purpose. SF Pro/SF Mono are already on the user's Mac and iPhone, need
  no licence to embed, and `-apple-system` switches optical sizes automatically. Don't add a webfont
  without a reason that survives the phone.
- `LifeStats` derives a year of history from vault *metadata only* — filename dates, which Context pages
  sit beside a daily note, and `TFile.stat.size`. Home re-renders on every open, so reading 365 notes to
  draw two small charts is not an option; that budget is what the numbers are allowed to mean. Don't add a
  metric here that needs file contents — put it behind a command instead.
- The radar normalizes against the user's own busiest role, never an absolute target. The question is "is
  my life lopsided", and a fixed target would just make a quiet year look like a failure. A role at zero
  still gets an axis and a hollow dot — that's the most useful thing the chart can say.
- Consistency levels are quantiles of the user's own days, not byte thresholds. A template that grows would
  make absolute cutoffs drift into lying.
- The streak survives today being unwritten. A streak that resets each morning only punishes you for
  checking Home early.
- **Nothing written into a daily note or Context page is ever deleted by the plugin** (D1). A rebuild keeps
  every existing activity block that has content beneath its heading — even for an activity that is now
  dropped or done — and merges genuinely new todos in rather than replacing the user's lines
  (`ActivitiesInProgress.mergeWithWritten`). Because the fresh section absorbs those blocks verbatim,
  `DailyNoteComposer` strips the originals first (`stripActivityBlocks`) or they would appear twice.
- **Drop** and the `done`/`backlog` stages also prune the activity's block from today's daily note and
  Context pages — but only when that block is **empty**. A block with content stays, and the user is told so
  via a `Notice`. Empty/non-empty is the whole rule: see `src/utilities/DailyNoteSection.ts`.
- Matrix buttons write via `FileIO.updateFrontmatterFields`, which does pure line-level surgery
  (`upsertFrontmatterField`) rather than a YAML round-trip, so hand-written field order survives.

**Rule: Pure logic classes (Block, BlockCollection, NoteBlocksParser, AttributesProcessor) must have zero Obsidian API dependency.** They take strings, return objects. This is what makes them unit-testable with Jest.

## Current status (all phases complete)

All 7 implementation phases done. 511 tests passing. Plugin deployed to `.obsidian/plugins/2ndbrain-engine/`.

**Components** — all in `src/`: Block, BlockCollection, NoteBlocksParser, FileIO, ScriptsRemove, AttributesProcessor, ProjectDescriptionInjector, MentionsProcessor, ActivitiesInProgress, TodoSyncManager, AutoActivityCreator, ActivityComposer, DailyNoteComposer.

### Install

```bash
npm install
```

### Dev (watch)

```bash
npm run dev
```

### Production build

```bash
npm run build
```

## Linting

- To use eslint install eslint from terminal: `npm install -g eslint`
- To use eslint to analyze this project use this command: `eslint main.ts`
- eslint will then create a report with suggestions for code improvement by file and line number.
- If your source code is in a folder, such as `src`, you can use eslint with this command to analyze all files in that folder: `eslint ./src/`

## File & folder conventions

- **Organize code into multiple files**: Split functionality across separate modules rather than putting everything in `main.ts`.
- Source lives in `src/`. Keep `main.ts` small and focused on plugin lifecycle (loading, unloading, registering commands).
- **Example file structure**:
  ```
  src/
    main.ts           # Plugin entry point, lifecycle management
    settings.ts       # Settings interface and defaults
    commands/         # Command implementations
      command1.ts
      command2.ts
    ui/              # UI components, modals, views
      modal.ts
      view.ts
    utils/           # Utility functions, helpers
      helpers.ts
      constants.ts
    types.ts         # TypeScript interfaces and types
  ```
- **Do not commit build artifacts**: Never commit `node_modules/`, `main.js`, or other generated files to version control.
- Keep the plugin small. Avoid large dependencies. Prefer browser-compatible packages.
- Generated output should be placed at the plugin root or `dist/` depending on your build setup. Release artifacts must end up at the top level of the plugin folder in the vault (`main.js`, `manifest.json`, `styles.css`).

## Manifest rules (`manifest.json`)

- Must include (non-exhaustive):  
  - `id` (plugin ID; for local dev it should match the folder name)  
  - `name`  
  - `version` (Semantic Versioning `x.y.z`)  
  - `minAppVersion`  
  - `description`  
  - `isDesktopOnly` (boolean)  
  - Optional: `author`, `authorUrl`, `fundingUrl` (string or map)
- Never change `id` after release. Treat it as stable API.
- Keep `minAppVersion` accurate when using newer APIs.
- Canonical requirements are coded here: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Testing

- Manual install for testing: copy `main.js`, `manifest.json`, `styles.css` (if any) to:
  ```
  <Vault>/.obsidian/plugins/<plugin-id>/
  ```
- Reload Obsidian and enable the plugin in **Settings → Community plugins**.

## Commands & settings

- Any user-facing commands should be added via `this.addCommand(...)`.
- If the plugin has configuration, provide a settings tab and sensible defaults.
- Persist settings using `this.loadData()` / `this.saveData()`.
- Use stable command IDs; avoid renaming once released.

## Versioning & releases

- Bump `version` in `manifest.json` (SemVer) and update `versions.json` to map plugin version → minimum app version.
- Create a GitHub release whose tag exactly matches `manifest.json`'s `version`. Do not use a leading `v`.
- Attach `manifest.json`, `main.js`, and `styles.css` (if present) to the release as individual assets.
- After the initial release, follow the process to add/update your plugin in the community catalog as required.

## Security, privacy, and compliance

Follow Obsidian's **Developer Policies** and **Plugin Guidelines**. In particular:

- Default to local/offline operation. Only make network requests when essential to the feature.
- No hidden telemetry. If you collect optional analytics or call third-party services, require explicit opt-in and document clearly in `README.md` and in settings.
- Never execute remote code, fetch and eval scripts, or auto-update plugin code outside of normal releases.
- Minimize scope: read/write only what's necessary inside the vault. Do not access files outside the vault.
- Clearly disclose any external services used, data sent, and risks.
- Respect user privacy. Do not collect vault contents, filenames, or personal information unless absolutely necessary and explicitly consented.
- Avoid deceptive patterns, ads, or spammy notifications.
- Register and clean up all DOM, app, and interval listeners using the provided `register*` helpers so the plugin unloads safely.

## UX & copy guidelines (for UI text, commands, settings)

- Prefer sentence case for headings, buttons, and titles.
- Use clear, action-oriented imperatives in step-by-step copy.
- Use **bold** to indicate literal UI labels. Prefer "select" for interactions.
- Use arrow notation for navigation: **Settings → Community plugins**.
- Keep in-app strings short, consistent, and free of jargon.

## Performance

- Keep startup light. Defer heavy work until needed.
- Avoid long-running tasks during `onload`; use lazy initialization.
- Batch disk access and avoid excessive vault scans.
- Debounce/throttle expensive operations in response to file system events.

## Coding conventions

- TypeScript with `"strict": true` preferred.
- **Keep `main.ts` minimal**: Focus only on plugin lifecycle (onload, onunload, addCommand calls). Delegate all feature logic to separate modules.
- **Split large files**: If any file exceeds ~200-300 lines, consider breaking it into smaller, focused modules.
- **Use clear module boundaries**: Each file should have a single, well-defined responsibility.
- Bundle everything into `main.js` (no unbundled runtime deps).
- Avoid Node/Electron APIs if you want mobile compatibility; set `isDesktopOnly` accordingly.
- Prefer `async/await` over promise chains; handle errors gracefully.

## Mobile

- Where feasible, test on iOS and Android.
- Don't assume desktop-only behavior unless `isDesktopOnly` is `true`.
- Avoid large in-memory structures; be mindful of memory and storage constraints.

## Agent do/don't

**Do**
- Add commands with stable IDs (don't rename once released).
- Provide defaults and validation in settings.
- Write idempotent code paths so reload/unload doesn't leak listeners or intervals.
- Use `this.register*` helpers for everything that needs cleanup.

**Don't**
- Introduce network calls without an obvious user-facing reason and documentation.
- Ship features that require cloud services without clear disclosure and explicit opt-in.
- Store or transmit vault contents unless essential and consented.

## Common tasks

### Organize code across multiple files

**main.ts** (minimal, lifecycle only):
```ts
import { Plugin } from "obsidian";
import { MySettings, DEFAULT_SETTINGS } from "./settings";
import { registerCommands } from "./commands";

export default class MyPlugin extends Plugin {
  settings: MySettings;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    registerCommands(this);
  }
}
```

**settings.ts**:
```ts
export interface MySettings {
  enabled: boolean;
  apiKey: string;
}

export const DEFAULT_SETTINGS: MySettings = {
  enabled: true,
  apiKey: "",
};
```

**commands/index.ts**:
```ts
import { Plugin } from "obsidian";
import { doSomething } from "./my-command";

export function registerCommands(plugin: Plugin) {
  plugin.addCommand({
    id: "do-something",
    name: "Do something",
    callback: () => doSomething(plugin),
  });
}
```

### Add a command

```ts
this.addCommand({
  id: "your-command-id",
  name: "Do the thing",
  callback: () => this.doTheThing(),
});
```

### Persist settings

```ts
interface MySettings { enabled: boolean }
const DEFAULT_SETTINGS: MySettings = { enabled: true };

async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  await this.saveData(this.settings);
}
```

### Register listeners safely

```ts
this.registerEvent(this.app.workspace.on("file-open", f => { /* ... */ }));
this.registerDomEvent(window, "resize", () => { /* ... */ });
this.registerInterval(window.setInterval(() => { /* ... */ }, 1000));
```

## Troubleshooting

- Plugin doesn't load after build: ensure `main.js` and `manifest.json` are at the top level of the plugin folder under `<Vault>/.obsidian/plugins/<plugin-id>/`. 
- Build issues: if `main.js` is missing, run `npm run build` or `npm run dev` to compile your TypeScript source code.
- Commands not appearing: verify `addCommand` runs after `onload` and IDs are unique.
- Settings not persisting: ensure `loadData`/`saveData` are awaited and you re-render the UI after changes.
- Mobile-only issues: confirm you're not using desktop-only APIs; check `isDesktopOnly` and adjust.

## References

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
