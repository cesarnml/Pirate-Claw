import type {
	CandidateStateRecord,
	MovieBreakdown,
	PirateClawDisposition,
	RunSummaryRecord,
	ShowBreakdown
} from '$lib/types';

// ── Date / time ──────────────────────────────────────────────────────────────

export function formatUptime(ms: number | null): string {
	if (ms === null) return 'Unavailable';
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}

export function formatDateParts(iso: string): { date: string; time: string; tz: string } {
	const d = new Date(iso);
	const date = d.toLocaleDateString(undefined, { dateStyle: 'medium' });
	const time = d.toLocaleTimeString(undefined, { timeStyle: 'short' });
	let tz = '';
	try {
		tz = d.toLocaleTimeString(undefined, { timeZoneName: 'short' }).split(' ').pop() || '';
	} catch {
		// ignore
	}
	return { date, time, tz };
}

export function formatDate(iso: string): string {
	return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatShortDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

// ── Speed / ETA ───────────────────────────────────────────────────────────────

export function formatSpeed(bytesPerSec: number): string {
	if (bytesPerSec >= 1_048_576) return `${(bytesPerSec / 1_048_576).toFixed(1)} MB/s`;
	return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
}

export function formatEta(eta: number): string {
	if (eta < 0) return '';
	if (eta < 60) return '<1m';
	const hours = Math.floor(eta / 3600);
	const minutes = Math.floor((eta % 3600) / 60);
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

export function formatTransferRate(bytesPerSec: number | undefined): string {
	if (typeof bytesPerSec !== 'number' || bytesPerSec <= 0) return 'Idle';
	return formatSpeed(bytesPerSec);
}

export function formatTransferSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

	const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
	let value = bytes;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	if (unitIndex === 0) return `${Math.round(value)} ${units[unitIndex]}`;
	const decimals = unitIndex >= 3 ? 2 : 1;
	return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

export function parseHostPortFromUrl(value: string): { host: string; port: string } {
	try {
		const url = new URL(value);
		return {
			host: url.hostname || 'unknown',
			port: url.port || (url.protocol === 'https:' ? '443' : '80')
		};
	} catch {
		return { host: value, port: 'unknown' };
	}
}

export function maskConfiguredValue(configured: boolean): string {
	return configured ? '••••••••' : 'not configured';
}

export function totalRunItems(summary: RunSummaryRecord | null): number | null {
	if (!summary) return null;
	return Object.values(summary.counts).reduce((sum, count) => sum + count, 0);
}

export function formatCycleLoad(durationMs: number | undefined): string {
	if (typeof durationMs !== 'number' || durationMs <= 0) return 'Unavailable';
	if (durationMs >= 60_000) return `${(durationMs / 60_000).toFixed(1)} min`;
	return `${(durationMs / 1000).toFixed(1)} sec`;
}

// ── Candidate display helpers ─────────────────────────────────────────────────

export function candidateTitle(candidate: CandidateStateRecord): string {
	if (
		candidate.mediaType === 'movie' &&
		candidate.tmdb &&
		'title' in candidate.tmdb &&
		candidate.tmdb.title
	) {
		return candidate.tmdb.title;
	}
	if (
		candidate.mediaType === 'tv' &&
		candidate.tmdb &&
		'name' in candidate.tmdb &&
		candidate.tmdb.name
	) {
		return candidate.tmdb.name;
	}
	return candidate.normalizedTitle;
}

export function candidatePosterUrl(candidate: CandidateStateRecord): string {
	if (candidate.tmdb && 'posterUrl' in candidate.tmdb && candidate.tmdb.posterUrl) {
		return candidate.tmdb.posterUrl;
	}
	if (candidate.mediaType === 'movie') return MOVIE_BACKDROP_FALLBACK;
	return TV_SHOW_BACKDROP_FALLBACK;
}

export function initialBox(title: string): string {
	return title.charAt(0).toUpperCase();
}

export function archiveHref(candidate: CandidateStateRecord): string {
	const slug = encodeURIComponent(candidate.normalizedTitle);
	return candidate.mediaType === 'tv' ? `/shows/${slug}` : '/movies';
}

// ── Movie display helpers ─────────────────────────────────────────────────────

export function movieDisplayTitle(movie: MovieBreakdown): string {
	return movie.tmdb?.title ?? movie.normalizedTitle;
}

export function formatRating(value: number): string {
	return value.toFixed(1);
}

/**
 * Short date for movie "Queued" badges: "18 Apr 26".
 * Distinct from formatShortDate (uses UTC locale, different shape).
 */
export function formatMovieQueuedDate(value: string | undefined): string {
	if (!value) return 'Unknown';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return 'Unknown';
	const day = date.getDate().toString().padStart(2, '0');
	const month = date.toLocaleString('en-US', { month: 'short' });
	const year = date.getFullYear().toString().slice(-2);
	return `${day} ${month} ${year}`;
}

export function formatLastWatched(value: string | null): string {
	if (!value) return 'No Plex activity';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return 'No Plex activity';
	return `Last watched ${date.toLocaleDateString()}`;
}

/**
 * Human-readable relative time ("5m ago", "3h ago", "2d ago"), falling back
 * to an absolute date past a week. Used for "last synced with Plex"-style
 * timestamps where staleness itself is the useful signal — telling "just
 * checked" apart from "checked a while ago, due for another look" isn't
 * possible with an absolute date alone at a glance.
 */
export function formatRelativeTime(value: string | null | undefined): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	const diffMs = Date.now() - date.getTime();
	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return date.toLocaleDateString();
}

/** Returns true when a Plex status badge should be shown (library hit or confirmed miss). */
export function hasPlexChip(plexStatus: string | undefined | null): boolean {
	return plexStatus === 'in_library' || plexStatus === 'missing';
}

export type ShowCompletion =
	| { status: 'unaired' }
	| { status: 'complete' }
	| { status: 'missing'; missingCount: number }
	| { status: null };

/**
 * A show's real completion state — replaces the old whole-show
 * in_library/missing dichotomy with something actually actionable: how many
 * aired episodes are missing, or whether the show simply hasn't aired at
 * all yet ("Golden Axe" case: MISSING was never an honest label for a show
 * with zero episodes out).
 *
 * 'unaired' is cheap and immediate — TMDB's firstAirDate is fetched for
 * every show already, no per-episode Plex data needed. 'complete'/'missing'
 * need the deeper per-season cache (seasonCompletions), which is only
 * populated once a show's detail page has been viewed or "Refresh Plex"
 * clicked at least once — `{ status: null }` means that hasn't happened
 * yet, and the caller should show nothing rather than guess.
 */
/** "Today" in TMDB air_date's own timezone — the US broadcast day. Mirrors
 * broadcastTodayIsoDate in src/shows/episode-status.ts; the two have to
 * agree or the shows list and a show's own page disagree about what has
 * aired. Not the browser's local date (the operator travels) and not UTC
 * (~5h ahead of Eastern, so it rolls the air day over mid-broadcast).
 *
 * Built from formatToParts with 'en-US', not the more direct
 * `new Intl.DateTimeFormat('en-CA', {timeZone}).format(now)` — a Node build
 * with small-icu (no full timezone-aware locale data, which Docker's slim
 * base images commonly ship) silently mis-renders 'en-CA' as M/D/YYYY
 * instead of YYYY-MM-DD, corrupting every string comparison against
 * airDate. 'en-US' + explicit numeric fields is the same underlying
 * Intl.DateTimeFormat/ICU machinery, so it's still timezone-correct either
 * way, but reassembling the digits ourselves sidesteps locale-data
 * completeness entirely. */
export function broadcastTodayIsoDate(now: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/New_York',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(now);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return `${get('year')}-${get('month')}-${get('day')}`;
}

export function computeShowCompletion(show: ShowBreakdown): ShowCompletion {
	const todayIsoDate = broadcastTodayIsoDate();
	const firstAirDate = show.tmdb?.firstAirDate;
	if (firstAirDate !== undefined && firstAirDate >= todayIsoDate) {
		return { status: 'unaired' };
	}

	const completions = show.seasonCompletions;
	if (!completions || completions.length === 0) {
		return { status: null };
	}

	const totalAired = completions.reduce((sum, c) => sum + c.airedCount, 0);
	const totalOwned = completions.reduce((sum, c) => sum + c.ownedCount, 0);
	if (totalAired === 0) {
		// Confirms the same conclusion as the firstAirDate check above, from
		// the season-level data instead — belt and suspenders for a show
		// whose firstAirDate wasn't available for some reason.
		return { status: 'unaired' };
	}
	if (totalOwned >= totalAired) {
		return { status: 'complete' };
	}
	return { status: 'missing', missingCount: totalAired - totalOwned };
}

/**
 * The oldest per-season cachedAt across a show's seasonCompletions — the
 * honest "as of" bound for a whole-show COMPLETE/MISSING claim built by
 * summing all of them. Deliberately the oldest, not the newest or an
 * average: a show is only as fresh as its stalest contributing season, and
 * showing a more-recent unrelated timestamp next to the claim (e.g. the
 * whole-show Plex flag's own, separately-triggered refresh time) would
 * imply more freshness than the completion badge actually has. Returns null
 * when seasonCompletions is absent (nothing computed yet).
 */
export function completionCheckedAt(show: ShowBreakdown): string | null {
	const completions = show.seasonCompletions;
	if (!completions || completions.length === 0) return null;
	return completions.reduce(
		(oldest, c) => (c.cachedAt < oldest ? c.cachedAt : oldest),
		completions[0].cachedAt
	);
}

/**
 * Validates an image URL is https-only. Returns null for missing, non-https, or malformed URLs.
 * Use `movieBackdropSrc` for backdrop images that should fall back to the static default.
 */
export function safeHttpsUrl(value: string | undefined): string | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
}

/** Served from `static/` in SvelteKit — used when TMDB backdrop is missing or not https. */
export const MOVIE_BACKDROP_FALLBACK = '/movie-backdrop-fallback.webp';

export function movieBackdropSrc(backdropUrl: string | undefined): string {
	if (!backdropUrl) return MOVIE_BACKDROP_FALLBACK;
	try {
		const url = new URL(backdropUrl);
		return url.protocol === 'https:' ? url.href : MOVIE_BACKDROP_FALLBACK;
	} catch {
		return MOVIE_BACKDROP_FALLBACK;
	}
}

/** Served from `static/` in SvelteKit — used when a TV show has no usable TMDB backdrop. */
export const TV_SHOW_BACKDROP_FALLBACK = '/tv-show-backdrop-fallback.webp';

/**
 * Full-bleed show card background: prefers TMDB backdrop (https), else poster, else static fallback.
 */
export function showHeroBackdropSrc(
	backdropUrl: string | undefined,
	posterUrl: string | undefined
): string {
	const backdrop = safeHttpsUrl(backdropUrl);
	if (backdrop) return backdrop;
	const poster = safeHttpsUrl(posterUrl);
	if (poster) return poster;
	return TV_SHOW_BACKDROP_FALLBACK;
}

// ── Show display helpers ──────────────────────────────────────────────────────

export function showDisplayTitle(show: ShowBreakdown): string {
	return show.tmdb?.name ?? show.normalizedTitle;
}

/**
 * The show's *tracked* identity when TMDB resolved it to a meaningfully
 * different name — otherwise `null`.
 *
 * `showDisplayTitle` above shows `tmdb.name` in preference to the tracked
 * title, which is the right default (TMDB's title is properly cased and
 * punctuated) but hides a real failure mode: when TMDB matches the wrong
 * series, every surface silently renames the show to one the operator never
 * tracked, and the URL slug, the untrack action, and the RSS matching all
 * still key off the *tracked* title. That is how an operator ended up staring
 * at a "Tomb Raider King" card they never added, with no way to tell what
 * "Untrack show" would actually remove (2026-09-03 incident).
 *
 * Casing/punctuation differences are not a divergence — "test show" resolving
 * to "Test Show" is the normal, healthy case and must stay quiet, or the
 * warning becomes noise on every card and stops being read.
 */
export function showTrackedIdentityMismatch(show: ShowBreakdown): string | null {
	const tmdbName = show.tmdb?.name;
	if (!tmdbName) return null;
	if (normalizeTitleForCompare(tmdbName) === normalizeTitleForCompare(show.normalizedTitle)) {
		return null;
	}
	return show.normalizedTitle;
}

/** Mirrors the daemon's own `normalizeForMatch` (src/adoption/title-match.ts):
 * fold diacritics, drop non-alphanumerics, collapse whitespace. */
function normalizeTitleForCompare(input: string): string {
	return input
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function showHref(normalizedTitle: string): string {
	return `/shows/${encodeURIComponent(normalizedTitle.toLowerCase())}`;
}

/** Format 0–1 fraction as a rounded percentage string. */
export function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

// ── Torrent display helpers ───────────────────────────────────────────────────

export type TorrentDisplayState =
	| 'queued'
	| 'paused'
	| 'downloading'
	| 'completed'
	| 'missing'
	| 'removed'
	| 'deleted';

export function torrentDisplayState(
	candidate: {
		pirateClawDisposition?: PirateClawDisposition;
		transmissionTorrentHash?: string;
		transmissionPercentDone?: number;
		transmissionStatusCode?: number;
	},
	liveHashes: Set<string>
): TorrentDisplayState {
	if (candidate.pirateClawDisposition === 'deleted') return 'deleted';
	if (!candidate.transmissionTorrentHash) return 'queued';
	if (candidate.transmissionPercentDone === 1) return 'completed';
	if (candidate.pirateClawDisposition === 'removed') return 'removed';
	if (!liveHashes.has(candidate.transmissionTorrentHash)) return 'missing';
	if (candidate.transmissionStatusCode === 0) return 'paused';
	return 'downloading';
}

export function getTorrentDisplayStatus(torrent: { status: string; percentDone: number }): string {
	if (torrent.status === 'error') return 'ERROR';
	if (torrent.status === 'seeding') return 'SEEDING';
	if (torrent.percentDone === 1) return 'COMPLETED';
	if (torrent.status === 'stopped' && torrent.percentDone < 1) return 'PAUSED';
	if (torrent.status === 'downloading' && torrent.percentDone < 1) return 'DOWNLOADING';
	return torrent.status.toUpperCase();
}
