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
	/** From GET /api/candidates when TMDB cache has metadata for this title. */
	tmdb?: TmdbMoviePublic | TmdbTvShowMeta;
};

export type TmdbTvEpisodeMeta = {
	name?: string;
	stillUrl?: string;
	airDate?: string;
	overview?: string;
};

export type TmdbTvShowMeta = {
	tmdbId?: number;
	name?: string;
	posterUrl?: string;
	backdropUrl?: string;
	overview?: string;
	voteAverage?: number;
	voteCount?: number;
	numberOfSeasons?: number;
};

export type ShowEpisode = {
	episode: number;
	identityKey: string;
	status: CandidateStatus;
	lifecycleStatus?: string;
	queuedAt?: string;
	tmdb?: TmdbTvEpisodeMeta;
};

export type ShowSeason = {
	season: number;
	episodes: ShowEpisode[];
};

export type ShowBreakdown = {
	normalizedTitle: string;
	seasons: ShowSeason[];
	tmdb?: TmdbTvShowMeta;
};

export type TmdbMoviePublic = {
	tmdbId?: number;
	title?: string;
	posterUrl?: string;
	backdropUrl?: string;
	overview?: string;
	voteAverage?: number;
	voteCount?: number;
};

export type MovieBreakdown = {
	normalizedTitle: string;
	year?: number;
	resolution?: string;
	codec?: string;
	identityKey: string;
	status: CandidateStatus;
	lifecycleStatus?: string;
	queuedAt?: string;
	tmdb?: TmdbMoviePublic;
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
};

export type FeedItemOutcomeStatus =
	| 'queued'
	| 'failed'
	| 'skipped_duplicate'
	| 'skipped_no_match';

export type RunStatus = 'running' | 'completed' | 'failed';

export type RunSummaryRecord = {
	id: number;
	startedAt: string;
	status: RunStatus;
	completedAt?: string;
	counts: Record<FeedItemOutcomeStatus, number>;
};

export type CycleSnapshot = {
	status: RunStatus;
	startedAt: string;
	completedAt?: string;
	durationMs?: number;
};

export type DaemonHealth = {
	uptime: number;
	startedAt: string;
	lastRunCycle?: CycleSnapshot;
	lastReconcileCycle?: CycleSnapshot;
};
