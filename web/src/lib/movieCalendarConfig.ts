// Movie-calendar equivalent of calendarConfig.ts — shared between the
// route's server files and its client component so the client can import
// the real page-size value instead of duplicating it. Kept as its own
// constant (not reusing CALENDAR_PAGE_SIZE) since the two routes are
// independent features that happen to share a pagination shape, not one
// feature split across two files — see notes/public/movie-calendar-scope.md.
export const MOVIE_CALENDAR_PAGE_SIZE = 16;
