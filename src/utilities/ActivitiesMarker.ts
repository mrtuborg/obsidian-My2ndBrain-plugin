/**
 * Hidden sentinel written into a daily note once its Activities section has
 * been built, so DailyNoteComposer can tell "already processed, treat as
 * frozen" apart from "not built yet, needs the pipeline to run" without
 * requiring a visible "### Activities:" heading in the note.
 *
 * It's an HTML comment so Obsidian's reading view and Live Preview render it
 * as nothing — the user only sees the activity links/todos themselves, not a
 * redundant section label.
 */
export const ACTIVITIES_BUILT_MARKER = '<!-- 2ndbrain:activities-built -->';
