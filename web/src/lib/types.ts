export type CandidateStatus = 'queued' | 'skipped_duplicate' | 'failed' | 'dismissed';

export type PirateClawDisposition = 'removed' | 'deleted';

export type CandidateStateRecord = {
	identityKey: string;
	mediaType: 'movie' | 'tv';
	status: CandidateStatus;
	queuedAt?: string;
	pirateClawDisposition?: PirateClawDisposition;
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
	network?: string;
	overview?: string;
	voteAverage?: number;
	voteCount?: number;
	numberOfSeasons?: number;
};

export type PlexStatus = 'in_library' | 'missing' | 'unknown';

export type ShowEpisode = {
	episode: number;
	identityKey: string;
	status: CandidateStatus;
	pirateClawDisposition?: PirateClawDisposition;
	queuedAt?: string;
	resolution?: string;
	codec?: string;
	transmissionPercentDone?: number;
	transmissionStatusCode?: number;
	transmissionTorrentHash?: string;
	tmdb?: TmdbTvEpisodeMeta;
};

export type ShowSeason = {
	season: number;
	episodes: ShowEpisode[];
};

export type ShowBreakdown = {
	normalizedTitle: string;
	seasons: ShowSeason[];
	plexStatus: PlexStatus;
	watchCount: number | null;
	lastWatchedAt: string | null;
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
	pirateClawDisposition?: PirateClawDisposition;
	queuedAt?: string;
	transmissionPercentDone?: number;
	transmissionStatusCode?: number;
	transmissionTorrentHash?: string;
	plexStatus: PlexStatus;
	watchCount: number | null;
	lastWatchedAt: string | null;
	tmdb?: TmdbMoviePublic;
};

export type ReviewOutcomeRecord = {
	id: number;
	runId: number;
	status: 'failed';
	recordedAt: string;
	title: string | null;
	feedName: string | null;
	identityKey: string;
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
	reconcileIntervalSeconds: number;
	artifactDir: string;
	artifactRetentionDays: number;
	apiPort?: number;
	tmdbRefreshIntervalMinutes?: number;
};

export type PlexConfig = {
	url: string;
	token: string;
	refreshIntervalMinutes: number;
};

export type PlexAuthState =
	| 'not_connected'
	| 'connecting'
	| 'connected'
	| 'reconnect_required'
	| 'renewing'
	| 'expired_reconnect_required'
	| 'error_reconnect_required';

export type PlexAuthStatusResponse = {
	state: PlexAuthState;
	plexUrl: string;
	hasToken: boolean;
	returnTo: string | null;
};

export type AppConfig = {
	feeds: FeedConfig[];
	tv: TvRule[];
	/** Present when the config file uses compact tv format with explicit defaults. */
	tvDefaults?: { resolutions: string[]; codecs: string[] };
	movies?: MoviePolicy;
	transmission: TransmissionConfig;
	runtime: RuntimeConfig;
	plex?: PlexConfig;
};

export type OnboardingState = 'initial_empty' | 'partial_setup' | 'ready' | 'writes_disabled';

export type OnboardingStatus = {
	state: OnboardingState;
	hasFeeds: boolean;
	hasTvTargets: boolean;
	hasMovieTargets: boolean;
	minimumComplete: boolean;
};

export type TorrentStatSnapshot = {
	hash: string;
	name: string;
	status: 'downloading' | 'seeding' | 'stopped' | 'error';
	percentDone: number;
	rateDownload: number;
	rateUpload: number;
	eta: number;
};

export type SessionInfo = {
	version: string;
	downloadSpeed: number;
	uploadSpeed: number;
	activeTorrentCount: number;
	cumulativeDownloadedBytes: number;
	cumulativeUploadedBytes: number;
	currentDownloadedBytes: number;
	currentUploadedBytes: number;
};

export type FeedItemOutcomeStatus = 'queued' | 'failed' | 'skipped_duplicate' | 'skipped_no_match';

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

export type SetupState = 'starter' | 'partially_configured' | 'ready';
export type ReadinessState = 'not_ready' | 'ready_pending_restart' | 'ready';

export type ReadinessResponse = {
	state: ReadinessState;
	configState: SetupState;
	transmissionReachable: boolean;
	daemonLive: boolean;
};

export type TransmissionCompatibility =
	| 'recommended'
	| 'compatible'
	| 'compatible_custom'
	| 'not_reachable';

export type TransmissionStatusResponse = {
	compatibility: TransmissionCompatibility;
	url: string;
	reachable: boolean;
	advisory?: string;
};
