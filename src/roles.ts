// Context/role values a Project can be tagged with (frontmatter `role:` field).
// Activities linked to a rolled-up Project are surfaced in that role's dated
// <contextsFolder>/<Role>/YYYY-MM-DD.md page instead of the daily note.
// Activities with no linked project (or an unrolled one) always stay in the
// daily note. Kept in its own module (no Obsidian API) so pure composers can
// import it without pulling in settings.ts's Plugin-typed dependency.
export const ROLES = ['Family', 'Engineer', 'TechLead', 'Entrepreneur', 'Selfcare'] as const;
export type Role = typeof ROLES[number];
