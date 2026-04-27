import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { deriveOnboardingStatus } from '$lib/onboarding';
import { apiRequest } from '$lib/server/api';
import type {
	AppConfig,
	FeedConfig,
	MoviePolicy,
	PlexAuthStatusResponse,
	ReadinessResponse,
	TransmissionCompatibility,
	TransmissionStatusResponse
} from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const canWrite = !!env.PIRATE_CLAW_API_WRITE_TOKEN;

	try {
		const [configResponse, readinessResponse, plexAuthResponse] = await Promise.all([
			apiRequest('/api/config'),
			apiRequest('/api/setup/readiness'),
			apiRequest('/api/plex/auth/status')
		]);

		if (!configResponse.ok) {
			console.error('[onboarding] failed to load /api/config');
			return {
				config: null,
				etag: null,
				canWrite,
				onboarding: null,
				plexAuth: null,
				readinessState: null,
				error: 'Could not reach the API.'
			};
		}

		const config = (await configResponse.json()) as AppConfig;
		const etag = configResponse.headers.get('etag');
		const readinessState = readinessResponse.ok
			? ((await readinessResponse.json()) as ReadinessResponse).state
			: null;
		const plexAuth = plexAuthResponse.ok
			? ((await plexAuthResponse.json()) as PlexAuthStatusResponse)
			: null;

		return {
			config,
			etag,
			canWrite,
			onboarding: deriveOnboardingStatus(config, canWrite),
			plexAuth,
			readinessState,
			error: null
		};
	} catch (error) {
		console.error('[onboarding] failed to load /api/config', error);
		return {
			config: null,
			etag: null,
			canWrite,
			onboarding: null,
			plexAuth: null,
			readinessState: null,
			error: 'Could not reach the API.'
		};
	}
};

function parseExistingFeeds(raw: string | File | null): FeedConfig[] {
	if (raw === null) return [];
	try {
		const parsed = JSON.parse(String(raw));
		return Array.isArray(parsed) ? (parsed as FeedConfig[]) : [];
	} catch {
		return [];
	}
}

function parseExistingShows(raw: string | File | null): string[] {
	if (raw === null) return [];
	try {
		const parsed = JSON.parse(String(raw));
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((entry): entry is string => typeof entry === 'string')
			.map((entry) => entry.trim())
			.filter(Boolean);
	} catch {
		return [];
	}
}

function parseExistingYears(raw: string | File | null): number[] {
	if (raw === null) return [];
	try {
		const parsed = JSON.parse(String(raw));
		if (!Array.isArray(parsed)) return [];
		return parsed
			.map((entry) => Number(entry))
			.filter((entry) => Number.isInteger(entry) && entry >= 1900 && entry <= 2100);
	} catch {
		return [];
	}
}

export const actions: Actions = {
	saveFeed: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { feedsMessage: 'Config writes are disabled.' });
		}

		const formData = await request.formData();
		const ifMatch = String(formData.get('ifMatch') ?? '').trim();
		if (!ifMatch) {
			return fail(400, { feedsMessage: 'Missing config revision. Reload and try again.' });
		}

		const existingFeeds = parseExistingFeeds(formData.get('existingFeedsJson'));
		const name = String(formData.get('feedName') ?? '').trim();
		const url = String(formData.get('feedUrl') ?? '').trim();
		const mediaType = String(formData.get('feedMediaType') ?? 'tv').trim();
		const onboardingPath = String(formData.get('onboardingPath') ?? 'tv').trim();

		if (!name || !url) {
			return fail(400, { feedsMessage: 'Feed name and URL are required.' });
		}
		if (mediaType !== 'tv' && mediaType !== 'movie') {
			return fail(400, { feedsMessage: 'Feed type must be TV or Movie.' });
		}

		const feeds = [...existingFeeds, { name, url, mediaType }];

		try {
			const response = await apiRequest('/api/config/feeds', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`,
					'if-match': ifMatch
				},
				body: JSON.stringify(feeds)
			});

			if (!response.ok) {
				let feedsMessage = `Save failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) feedsMessage = body.error;
				} catch {
					// keep fallback message
				}
				return fail(response.status, {
					feedsMessage,
					feedsEtag: response.headers.get('etag')
				});
			}

			return {
				feedsSuccess: true,
				feedsMessage: 'Feed saved.',
				feedsEtag: response.headers.get('etag'),
				onboardingPath
			};
		} catch (error) {
			console.error('[onboarding] saveFeed failed:', error);
			return fail(500, { feedsMessage: 'Could not save feed.' });
		}
	},

	saveTvTarget: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { tvTargetMessage: 'Config writes are disabled.' });
		}

		const formData = await request.formData();
		const ifMatch = String(formData.get('ifMatch') ?? '').trim();
		if (!ifMatch) {
			return fail(400, { tvTargetMessage: 'Missing config revision. Reload and try again.' });
		}

		const showName = String(formData.get('showName') ?? '').trim();
		if (!showName) {
			return fail(400, { tvTargetMessage: 'A TV show name is required.' });
		}
		const onboardingPath = String(formData.get('onboardingPath') ?? 'tv').trim();

		const existingShows = parseExistingShows(formData.get('existingShowsJson'));
		const nextShows = existingShows.includes(showName)
			? existingShows
			: [...existingShows, showName];
		const resolutions = formData.getAll('tvResolution').map(String);
		const codecs = formData.getAll('tvCodec').map(String);
		let tvTargetEtag = ifMatch;

		try {
			const defaultsResponse = await apiRequest('/api/config/tv/defaults', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`,
					'if-match': ifMatch
				},
				body: JSON.stringify({ resolutions, codecs })
			});

			if (!defaultsResponse.ok) {
				let tvTargetMessage = `Save failed (${defaultsResponse.status}).`;
				try {
					const body = (await defaultsResponse.json()) as { error?: string };
					if (body.error) tvTargetMessage = body.error;
				} catch {
					// keep fallback message
				}
				return fail(defaultsResponse.status, {
					tvTargetMessage,
					tvTargetEtag: defaultsResponse.headers.get('etag')
				});
			}

			tvTargetEtag = defaultsResponse.headers.get('etag') ?? ifMatch;
			const showsResponse = await apiRequest('/api/config', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`,
					'if-match': tvTargetEtag
				},
				body: JSON.stringify({ runtime: {}, tv: { shows: nextShows } })
			});

			if (!showsResponse.ok) {
				let tvTargetMessage = `Save failed (${showsResponse.status}).`;
				try {
					const body = (await showsResponse.json()) as { error?: string };
					if (body.error) tvTargetMessage = body.error;
				} catch {
					// keep fallback message
				}
				return fail(showsResponse.status, {
					tvTargetMessage,
					tvTargetEtag: showsResponse.headers.get('etag') ?? tvTargetEtag
				});
			}

			return {
				tvTargetSuccess: true,
				tvTargetMessage: 'TV target saved.',
				tvTargetEtag: showsResponse.headers.get('etag'),
				onboardingPath
			};
		} catch (error) {
			console.error('[onboarding] saveTvTarget failed:', error);
			return fail(500, {
				tvTargetMessage: 'Could not save TV target.',
				tvTargetEtag
			});
		}
	},

	saveMovieTarget: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { movieTargetMessage: 'Config writes are disabled.' });
		}

		const formData = await request.formData();
		const ifMatch = String(formData.get('ifMatch') ?? '').trim();
		if (!ifMatch) {
			return fail(400, { movieTargetMessage: 'Missing config revision. Reload and try again.' });
		}

		const rawYear = String(formData.get('movieYear') ?? '').trim();
		const movieYear = Number(rawYear);
		if (!Number.isInteger(movieYear) || movieYear < 1900 || movieYear > 2100) {
			return fail(400, {
				movieTargetMessage: 'Movie year must be a whole number between 1900 and 2100.'
			});
		}

		const movieCodecPolicy = String(formData.get('movieCodecPolicy') ?? '').trim();
		if (movieCodecPolicy !== 'prefer' && movieCodecPolicy !== 'require') {
			return fail(400, {
				movieTargetMessage: 'Codec policy must be "prefer" or "require".'
			});
		}

		const onboardingPath = String(formData.get('onboardingPath') ?? 'movie').trim();
		const movieResolutions = formData.getAll('movieResolution').map(String);
		const movieCodecs = formData.getAll('movieCodec').map(String);
		const existingYears = parseExistingYears(formData.get('existingMovieYearsJson'));
		const existingResolutions = parseExistingShows(formData.get('existingMovieResolutionsJson'));
		const existingCodecs = parseExistingShows(formData.get('existingMovieCodecsJson'));
		const existingCodecPolicy = String(formData.get('existingMovieCodecPolicy') ?? 'prefer').trim();
		const nextYears = [...new Set([...existingYears, movieYear])].sort((a, b) => a - b);
		const hasExistingMoviePolicy = existingResolutions.length > 0 || existingCodecs.length > 0;
		const payload: MoviePolicy = {
			years: nextYears,
			resolutions: hasExistingMoviePolicy ? existingResolutions : movieResolutions,
			codecs: hasExistingMoviePolicy ? existingCodecs : movieCodecs,
			codecPolicy:
				hasExistingMoviePolicy &&
				(existingCodecPolicy === 'prefer' || existingCodecPolicy === 'require')
					? existingCodecPolicy
					: movieCodecPolicy
		};

		try {
			const response = await apiRequest('/api/config/movies', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`,
					'if-match': ifMatch
				},
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				let movieTargetMessage = `Save failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) movieTargetMessage = body.error;
				} catch {
					// keep fallback message
				}
				return fail(response.status, {
					movieTargetMessage,
					movieTargetEtag: response.headers.get('etag')
				});
			}

			return {
				movieTargetSuccess: true,
				movieTargetMessage: 'Movie target saved.',
				movieTargetEtag: response.headers.get('etag'),
				onboardingPath
			};
		} catch (error) {
			console.error('[onboarding] saveMovieTarget failed:', error);
			return fail(500, { movieTargetMessage: 'Could not save movie target.' });
		}
	},

	testTransmission: async () => {
		try {
			const response = await apiRequest('/api/setup/transmission/status');
			const status = response.ok ? ((await response.json()) as TransmissionStatusResponse) : null;
			const compatibility: TransmissionCompatibility = status?.compatibility ?? 'not_reachable';
			return {
				transmissionReachable: status?.reachable ?? false,
				transmissionCompatibility: compatibility,
				transmissionAdvisory: status?.advisory ?? null
			};
		} catch {
			return {
				transmissionReachable: false,
				transmissionCompatibility: 'not_reachable' as TransmissionCompatibility,
				transmissionAdvisory: null
			};
		}
	},

	saveDownloadDirs: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { downloadDirsMessage: 'Config writes are disabled.' });
		}

		const formData = await request.formData();
		const ifMatch = String(formData.get('ifMatch') ?? '').trim();
		if (!ifMatch) {
			return fail(400, { downloadDirsMessage: 'Missing config revision. Reload and try again.' });
		}

		const tvDir = String(formData.get('tvDir') ?? '').trim();
		const movieDir = String(formData.get('movieDir') ?? '').trim();
		const downloadDirs: { tv?: string; movie?: string } = {};
		if (tvDir) downloadDirs.tv = tvDir;
		if (movieDir) downloadDirs.movie = movieDir;

		try {
			const response = await apiRequest('/api/config/transmission/download-dirs', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`,
					'if-match': ifMatch
				},
				body: JSON.stringify(downloadDirs)
			});

			if (!response.ok) {
				let downloadDirsMessage = `Save failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) downloadDirsMessage = body.error;
				} catch {
					// keep fallback message
				}
				return fail(response.status, {
					downloadDirsMessage,
					downloadDirsEtag: response.headers.get('etag')
				});
			}

			return {
				downloadDirsSuccess: true,
				downloadDirsMessage: 'Download directories saved.',
				downloadDirsEtag: response.headers.get('etag')
			};
		} catch (error) {
			console.error('[onboarding] saveDownloadDirs failed:', error);
			return fail(500, { downloadDirsMessage: 'Could not save download directories.' });
		}
	},

	reapplyConfig: async () => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { reapplyMessage: 'Config writes are disabled.' });
		}

		const configResponse = await apiRequest('/api/config');
		if (!configResponse.ok) {
			return fail(500, { reapplyMessage: 'Could not load config.' });
		}
		const config = (await configResponse.json()) as AppConfig;
		const etag = configResponse.headers.get('etag');
		if (!etag) {
			return fail(500, { reapplyMessage: 'Missing config revision.' });
		}

		try {
			const response = await apiRequest('/api/config/feeds', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`,
					'if-match': etag
				},
				body: JSON.stringify(config.feeds ?? [])
			});

			if (!response.ok) {
				let reapplyMessage = `Re-apply failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) reapplyMessage = body.error;
				} catch {
					// keep fallback
				}
				return fail(response.status, { reapplyMessage });
			}

			return { reapplySuccess: true };
		} catch (error) {
			console.error('[onboarding] reapplyConfig failed:', error);
			return fail(500, { reapplyMessage: 'Could not re-apply config.' });
		}
	}
};
