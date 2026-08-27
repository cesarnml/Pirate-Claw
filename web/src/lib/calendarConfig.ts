// Shared between the calendar's server routes (+page.server.ts,
// calendar/more/+server.ts) and the client component (+page.svelte) — kept
// in a plain $lib module (rather than defined in +page.server.ts) so the
// client-side component can import the real value instead of duplicating
// it, without pulling server-only code into the browser bundle.
export const CALENDAR_PAGE_SIZE = 16;
