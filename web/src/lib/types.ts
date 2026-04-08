export type CandidateStatus =
	| 'queued'
	| 'skipped'
	| 'rejected'
	| 'duplicate'
	| 'reconciled'
	| 'downloading'
	| 'completed'
	| 'failed';

export type CandidateLifecycleStatus = 'active' | 'seeding' | 'stopped' | 'error';

export type CandidateStateRecord = {
	identityKey: string;
	mediaType: 'movie' | 'tv';
	status: CandidateStatus;
	queuedAt?: string;
	lifecycleStatus?: CandidateLifecycleStatus;
	reconciledAt?: string;
	transmissionTorrentId?: number;
	transmissionTorrentName?: string;
	transmissionTorrentHash?: string;
	transmissionStatusCode?: number;
	transmissionPercentDone?: number;
	transmissionDoneDate?: string;
	transmissionDownloadDir?: string;
	ruleName: string;
	score: number;
	reasons: string[];
	rawTitle: string;
	normalizedTitle: string;
	season?: number;
	episode?: number;
	year?: number;
	resolution?: string;
	codec?: string;
	feedName: string;
	guidOrLink: string;
	publishedAt: string;
	downloadUrl: string;
	firstSeenRunId: number;
	lastSeenRunId: number;
	lastFeedItemId?: number;
	updatedAt: string;
};

export type ShowEpisode = {
	episode: number;
	identityKey: string;
	status: string;
	lifecycleStatus?: string;
	queuedAt?: string;
};

export type ShowSeason = {
	season: number;
	episodes: ShowEpisode[];
};

export type ShowBreakdown = {
	normalizedTitle: string;
	seasons: ShowSeason[];
};
