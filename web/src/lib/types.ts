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
	/** Air date of the show's very first episode — a future date (or an
	 * empty show entirely) means nothing has aired yet at all. */
	firstAirDate?: string;
};

/** Aired-vs-owned episode counts for one season, cached server-side from a
 * real per-episode Plex walk (the show detail page, or "Refresh Plex") —
 * see src/tv-api-types.ts on the server. Absent entirely on ShowBreakdown
 * (not an empty array) means this show's completion has never been
 * computed yet. */
export type ShowSeasonCompletion = {
	season: number;
	airedCount: number;
	ownedCount: number;
	/** Per-season, not a single show-level timestamp — see
	 * src/tv-api-types.ts on the server. Use the oldest one as the
	 * trustworthy "as of" bound for any whole-show claim built from all of
	 * them together. */
	cachedAt: string;
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
	/** When the Plex cache last checked this show, even if stale — undefined
	 * when no cache row exists yet. See src/tv-api-types.ts on the server. */
	plexCheckedAt?: string | null;
	seasonCompletions?: ShowSeasonCompletion[];
	tmdb?: TmdbTvShowMeta;
};

// --- Missing-episodes feature (TMDB canonical episode list + live Plex
// per-episode presence + manual EZTV backfill) — GET /api/shows/:slug/episodes,
// /eztv, POST /manual-grab. Deliberately separate from ShowEpisode/ShowSeason
// above, which reflect local queue history (candidate_state), not TMDB's full
// episode list.

export type EpisodeManualGrabInfo = {
	queuedAt: string;
	source: string;
	rawTitle: string;
	transmissionTorrentHash: string | null;
	/** True when this grab's torrent looks stuck (see episode-status.ts's
	 * isStalledSnapshot) — powers the inline remove button. */
	stalled: boolean;
};

export type EpisodeWithStatus = {
	episode: number;
	name?: string;
	overview?: string;
	airDate?: string;
	plexStatus: PlexStatus;
	/** Every still-active manual grab for this episode, most recent first —
	 * plural since a replacement grab is meant to leave a stalled one
	 * visible/removable alongside it, not hide it. Empty when there's none. */
	manualGrabs: EpisodeManualGrabInfo[];
};

export type SeasonWithStatus = {
	season: number;
	episodes: EpisodeWithStatus[];
	/** Undefined when Plex data for this season isn't available to compare. */
	episodeCountMismatch: boolean | undefined;
};

export type ShowEpisodeStatus = {
	/** False when Plex data couldn't be confirmed right now — every episode
	 * then reads 'unknown', not 'missing'. */
	plexReachable: boolean;
	seasons: SeasonWithStatus[];
};

export type EztvTorrent = {
	id: number;
	title: string;
	filename: string;
	magnetUrl: string;
	season: number;
	episode: number;
	sizeBytes: number;
	seeds: number;
	peers: number;
	dateReleasedUnix: number;
	resolution?: string;
	codec?: string;
};

export type ThePirateBayTorrent = {
	id: number;
	title: string;
	magnetUrl: string;
	infoHash: string;
	sizeBytes: number;
	seeds: number;
	peers: number;
	addedUnix: number;
	imdbId: string | null;
	resolution?: string;
	codec?: string;
};

/** Fields the missing-episodes panel actually renders — both EztvTorrent
 * and ThePirateBayTorrent satisfy this structurally, so one lookup-state
 * shape covers both search sources without a conversion step. */
export type TorrentSearchResult = {
	id: number;
	title: string;
	magnetUrl: string;
	sizeBytes: number;
	seeds: number;
	peers: number;
	resolution?: string;
	codec?: string;
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
	apiHost?: string;
	apiWriteToken?: string;
	installRoot?: string;
	tmdbRefreshIntervalMinutes?: number;
};

export type PlexConfig = {
	url: string;
	token: string;
	refreshIntervalMinutes: number;
};

export type TmdbConfig = {
	apiKey?: string;
	cacheTtlDays?: number;
	negativeCacheTtlDays?: number;
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
	tokenSource: 'config' | 'env' | 'none';
	returnTo: string | null;
	plexServerVersion: string | null;
	plexVersionCompatible: boolean | null;
};

export type AppConfig = {
	feeds: FeedConfig[];
	tv: TvRule[];
	/** Present when the config file uses compact tv format with explicit defaults. */
	tvDefaults?: { resolutions: string[]; codecs: string[] };
	movies?: MoviePolicy;
	transmission: TransmissionConfig;
	runtime: RuntimeConfig;
	tmdb?: TmdbConfig;
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
	status: 'downloading' | 'seeding' | 'queued' | 'stopped' | 'error';
	percentDone: number;
	rateDownload: number;
	rateUpload: number;
	eta: number;
	/** When Transmission added this torrent — powers the "how long has this
	 * been sitting in the manager" relative-time hint on Torrent Manager rows. */
	addedDate?: string;
	/** When this torrent finished — undefined until it has. */
	doneDate?: string;
	/** Set only for a manually-grabbed torrent (see manual_grabs /
	 * manual_movie_grabs) — it has no candidate_state row for the usual
	 * poster/title/media lookup to find, so the API attaches these from the
	 * grab record directly. */
	posterUrl?: string | null;
	displayTitle?: string | null;
	mediaType?: 'tv' | 'movie';
	/** TV manual grabs only — used for the row's meta chips. */
	season?: number;
	episode?: number;
	/** Set only for a manually-grabbed torrent — how it got there, powering
	 * the origin icon on Torrent Manager rows. Absent for a candidate_state
	 * (RSS) torrent; the dashboard infers "RSS" from having a matching
	 * candidate instead. See ManualGrabSource / ManualMovieGrabSource. */
	source?: TorrentOriginSource;
};

/** Where a manually-grabbed torrent came from — mirrors the union of
 * ManualGrabSource (src/manual-grabs/store.ts) and ManualMovieGrabSource
 * (src/manual-movie-grabs/store.ts) on the server. Kept as a plain string
 * union here rather than importing those server types, same convention as
 * the rest of this file. */
export type TorrentOriginSource =
	| 'eztv'
	| 'thepiratebay'
	| 'yts'
	| 'adopted-transmission'
	| 'adopted-filesystem'
	| 'adopted-plex';

/** One manual grab that still has a Transmission hash, regardless of
 * whether Transmission currently has it (see GET /api/manual-grabs/tracked)
 * — the manual-grab equivalent of CandidateStateRecord for "missing from
 * Transmission" detection (see torrentDisplayState/missingCandidates). */
export type ManualGrabTrackedEntry = {
	hash: string;
	mediaType: 'tv' | 'movie';
	posterUrl: string | null;
	displayTitle: string | null;
	normalizedTitle?: string;
	season?: number;
	episode?: number;
	source: TorrentOriginSource;
	disposition: 'removed' | 'deleted' | null;
};

/** One completed manually-grabbed torrent (see GET /api/manual-grabs/completed)
 * — the persisted half of Your Haul's manual-grab source, independent of
 * whether Transmission still has the torrent (see done_at's schema comment
 * in src/manual-grabs/schema.ts). */
export type ManualGrabArchiveEntry = {
	hash: string;
	mediaType: 'tv' | 'movie';
	posterUrl: string | null;
	displayTitle: string | null;
	normalizedTitle?: string;
	season?: number;
	episode?: number;
	doneAt: string;
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
	downloadQueueEnabled: boolean;
	downloadQueueSize: number;
	seedQueueEnabled: boolean;
	seedQueueSize: number;
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

export type DaemonCycleBucket = 'main' | 'tmdb' | 'plex';

export type DaemonCycleStress = {
	running: boolean;
	lastDurationMs: number | null;
	consecutiveSkips: number;
};

export type DaemonStress = 'idle' | 'busy' | 'overloaded';

export type DaemonHealth = {
	uptime: number;
	startedAt: string;
	lastRunCycle?: CycleSnapshot;
	lastReconcileCycle?: CycleSnapshot;
	cycles?: Record<DaemonCycleBucket, DaemonCycleStress>;
	stress?: DaemonStress;
};

export type SetupState = 'starter' | 'partially_configured' | 'ready';
export type ReadinessState = 'not_ready' | 'ready_pending_restart' | 'ready';
export type RestartStatus =
	| {
			state: 'idle';
			currentDaemonStartedAt: string;
	  }
	| {
			state: 'requested';
			requestId: string;
			requestedAt: string;
			requestedByStartedAt: string;
			currentDaemonStartedAt: string;
	  }
	| {
			state: 'back_online';
			requestId: string;
			requestedAt: string;
			requestedByStartedAt: string;
			returnedAt: string;
			returnedStartedAt: string;
			currentDaemonStartedAt: string;
	  };

export type ReadinessResponse = {
	state: ReadinessState;
	configState: SetupState;
	transmissionReachable: boolean;
	daemonLive: boolean;
};

export type InstallHealthStatus = 'pass' | 'fail' | 'skip';

export type InstallHealthCheck = {
	status: InstallHealthStatus;
	remediation: string;
	detail?: string;
};

export type InstallHealthResponse = {
	healthy: boolean;
	installRoot: string;
	checks: Record<string, InstallHealthCheck>;
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

export type NetworkPostureState =
	| 'unacknowledged'
	| 'direct_acknowledged'
	| 'already_secured_externally'
	| 'vpn_bridge_pending';

export type AuthStateResult = {
	owner_exists: boolean;
	setup_complete: boolean;
	trusted_origins: string[];
	network_posture: NetworkPostureState;
};
