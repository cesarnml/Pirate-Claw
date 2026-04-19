import type { CandidateStateRecord, PirateClawDisposition } from '$lib/types';

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

export function candidatePosterUrl(candidate: CandidateStateRecord): string | null {
	if (candidate.tmdb && 'posterUrl' in candidate.tmdb && candidate.tmdb.posterUrl) {
		return candidate.tmdb.posterUrl;
	}
	return null;
}

export function initialBox(title: string): string {
	return title.charAt(0).toUpperCase();
}

export function archiveHref(candidate: CandidateStateRecord): string {
	const slug = encodeURIComponent(candidate.normalizedTitle);
	return candidate.mediaType === 'tv' ? `/shows/${slug}` : '/movies';
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
	if (candidate.pirateClawDisposition) return candidate.pirateClawDisposition;
	if (!candidate.transmissionTorrentHash) return 'queued';
	if (candidate.transmissionPercentDone === 1) return 'completed';
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
