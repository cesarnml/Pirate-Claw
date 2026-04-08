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
	status: CandidateStatus;
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

export type FeedConfig = {
	name: string;
	url: string;
	mediaType: 'tv' | 'movie';
	parserHints?: Record<string, unknown>;
	pollIntervalMinutes?: number;
};

export type TvRule = {
	name: string;
	matchPattern?: string;
	resolutions: string[];
	codecs: string[];
};

export type MoviePolicy = {
	years: number[];
	resolutions: string[];
	codecs: string[];
	codecPolicy: 'prefer' | 'require';
};

export type TransmissionConfig = {
	url: string;
	username: string;
	password: string;
	downloadDir?: string;
	downloadDirs?: { movie?: string; tv?: string };
};

export type RuntimeConfig = {
	runIntervalMinutes: number;
	reconcileIntervalMinutes: number;
	artifactDir: string;
	artifactRetentionDays: number;
	apiPort?: number;
};

export type AppConfig = {
	feeds: FeedConfig[];
	tv: TvRule[];
	movies: MoviePolicy;
	transmission: TransmissionConfig;
	runtime: RuntimeConfig;
