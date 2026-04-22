import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { deriveOnboardingStatus } from '$lib/onboarding';
import { apiRequest } from '$lib/server/api';
import type {
	AppConfig,
	OnboardingStatus,
	PlexAuthStatusResponse,
	RunSummaryRecord,
	SessionInfo,
	TransmissionStatusResponse
} from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const canWrite = !!env.PIRATE_CLAW_API_WRITE_TOKEN;

	const [configResult, sessionResult, statusResult, plexAuthResult] = await Promise.allSettled([
		apiRequest('/api/config'),
		apiRequest('/api/transmission/session'),
		apiRequest('/api/status'),
		apiRequest('/api/plex/auth/status')
	]);

	let config: AppConfig | null = null;
	let etag: string | null = null;
	let error: string | null = null;
	let transmissionSession: SessionInfo | null = null;
	let runSummaries: RunSummaryRecord[] | null = null;
	let onboarding: OnboardingStatus | null = null;
	let plexAuth: PlexAuthStatusResponse | null = null;

	if (configResult.status === 'fulfilled' && configResult.value.ok) {
		config = (await configResult.value.json()) as AppConfig;
		etag = configResult.value.headers.get('etag');
		onboarding = deriveOnboardingStatus(config, canWrite);
	} else {
		console.error('[config] failed to load config');
		error = 'Could not reach the API.';
	}

	if (sessionResult.status === 'fulfilled' && sessionResult.value.ok) {
		transmissionSession = (await sessionResult.value.json()) as SessionInfo;
	}

	if (statusResult.status === 'fulfilled' && statusResult.value.ok) {
		const statusData = (await statusResult.value.json()) as { runs: RunSummaryRecord[] };
		runSummaries = statusData.runs;
	}

	if (plexAuthResult.status === 'fulfilled' && plexAuthResult.value.ok) {
		plexAuth = (await plexAuthResult.value.json()) as PlexAuthStatusResponse;
	} else {
		console.error('[config] failed to load plex auth status');
	}

	return {
		config,
		etag,
		canWrite,
		error,
		transmissionSession,
		runSummaries,
		onboarding,
		plexAuth
	};
};

function parseOptionalInt(input: unknown): number | undefined {
	if (input === null || input === undefined) return undefined;
	const raw = String(input).trim();
	if (!raw) return undefined;
	const value = Number(raw);
	if (!Number.isFinite(value) || !Number.isInteger(value)) return Number.NaN;
	return value;
}

function validateRuntimeBounds(
	field: string,
	value: number | undefined
): { ok: true } | { ok: false; message: string } {
	if (value === undefined) return { ok: true };
	if (!Number.isInteger(value)) {
		return { ok: false, message: `Field "${field}" has invalid value.` };
	}

	if (field === 'runIntervalMinutes' || field === 'reconcileIntervalSeconds') {
		return value > 0 ? { ok: true } : { ok: false, message: `Field "${field}" has invalid value.` };
	}

	if (field === 'tmdbRefreshIntervalMinutes') {
		return value >= 0
			? { ok: true }
			: { ok: false, message: `Field "${field}" has invalid value.` };
	}

	if (field === 'apiPort') {
		return value >= 1 && value <= 65535
			? { ok: true }
			: { ok: false, message: `Field "${field}" has invalid value.` };
	}

	return { ok: true };
}

export const actions: Actions = {
	savePlex: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { plexMessage: 'Config writes are disabled.', plexMessageTone: 'error' });
		}

		const formData = await request.formData();
		const ifMatch = String(formData.get('ifMatch') ?? '').trim();
		const plexUrl = String(formData.get('plexUrl') ?? '').trim();
		if (!ifMatch) {
			return fail(400, {
				plexMessage: 'Missing config revision. Reload and try again.',
				plexMessageTone: 'error'
			});
		}
		if (!plexUrl) {
			return fail(400, {
				plexMessage: 'Plex Media Server URL is required.',
				plexMessageTone: 'error'
			});
		}

		try {
			const response = await apiRequest('/api/config/plex', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`,
					'if-match': ifMatch
				},
				body: JSON.stringify({ url: plexUrl })
			});

			if (!response.ok) {
				let plexMessage = `Save failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) plexMessage = body.error;
				} catch {
					// keep fallback message
				}
				return fail(response.status, {
					plexMessage,
					plexMessageTone: 'error',
					plexEtag: response.headers.get('etag')
				});
			}

			return {
				plexMessage: 'Plex URL saved.',
				plexMessageTone: 'success',
				plexEtag: response.headers.get('etag')
			};
		} catch (error) {
			console.error('[config] savePlex failed:', error);
			return fail(500, { plexMessage: 'Could not save Plex URL.', plexMessageTone: 'error' });
		}
	},

	disconnectPlex: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { plexMessage: 'Config writes are disabled.', plexMessageTone: 'error' });
		}

		const formData = await request.formData();
		const ifMatch = String(formData.get('ifMatch') ?? '').trim();
		if (!ifMatch) {
			return fail(400, {
				plexMessage: 'Missing config revision. Reload and try again.',
				plexMessageTone: 'error'
			});
		}

		try {
			const response = await apiRequest('/api/plex/auth/disconnect', {
				method: 'POST',
				headers: {
					authorization: `Bearer ${writeToken}`,
					'if-match': ifMatch
				}
			});

			if (!response.ok) {
				let plexMessage = `Disconnect failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) plexMessage = body.error;
				} catch {
					// keep fallback message
				}
				return fail(response.status, {
					plexMessage,
					plexMessageTone: 'error',
					plexEtag: response.headers.get('etag')
				});
			}

			return {
				plexMessage: 'Plex disconnected.',
				plexMessageTone: 'success',
				plexEtag: response.headers.get('etag')
			};
		} catch (error) {
			console.error('[config] disconnectPlex failed:', error);
			return fail(500, {
				plexMessage: 'Could not disconnect Plex.',
				plexMessageTone: 'error'
			});
		}
	},

	saveShows: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(500, { showsMessage: 'Server write token is not configured.' });
		}

		const formData = await request.formData();
		const ifMatch = String(formData.get('ifMatch') ?? '').trim();
		if (!ifMatch) {
			return fail(400, { showsMessage: 'Missing config revision. Reload and try again.' });
		}

		const rawShowNames = formData.getAll('showName').map((v) => String(v).trim());
		const showNames = rawShowNames.filter((n) => n.length > 0);
		if (showNames.length < 1) {
			return fail(400, { showsMessage: 'At least one TV show name is required.' });
		}

		try {
			const response = await apiRequest('/api/config', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`,
					'if-match': ifMatch
				},
				body: JSON.stringify({ runtime: {}, tv: { shows: showNames } })
			});

			if (!response.ok) {
				let showsMessage = `Save failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) showsMessage = body.error;
				} catch {
					// keep fallback message
				}
				return fail(response.status, { showsMessage, showsEtag: response.headers.get('etag') });
			}

			return {
				showsSuccess: true,
				message: 'TV shows saved.',
				showsEtag: response.headers.get('etag')
			};
		} catch (error) {
			console.error('[config] saveShows failed:', error);
			return fail(500, { showsMessage: 'Could not save TV shows.' });
		}
	},

	saveRuntime: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(500, { runtimeMessage: 'Server write token is not configured.' });
		}

		const formData = await request.formData();
		const ifMatch = String(formData.get('runtimeIfMatch') ?? '').trim();
		if (!ifMatch) {
			return fail(400, { runtimeMessage: 'Missing config revision. Reload and try again.' });
		}

		const currentShows = formData
			.getAll('currentShow')
			.map((v) => String(v).trim())
			.filter(Boolean);
		if (currentShows.length < 1) {
			return fail(400, { runtimeMessage: 'Missing current TV shows. Reload and try again.' });
		}

		const runIntervalMinutes = parseOptionalInt(formData.get('runIntervalMinutes'));
		const reconcileIntervalSeconds = parseOptionalInt(formData.get('reconcileIntervalSeconds'));
		const tmdbRefreshIntervalMinutes = parseOptionalInt(formData.get('tmdbRefreshIntervalMinutes'));
		const apiPort = parseOptionalInt(formData.get('apiPort'));

		const invalidRuntimeField = [
			runIntervalMinutes,
			reconcileIntervalSeconds,
			tmdbRefreshIntervalMinutes,
			apiPort
		].some((value) => Number.isNaN(value));
		if (invalidRuntimeField) {
			return fail(400, { runtimeMessage: 'Runtime fields must be whole numbers.' });
		}

		for (const [field, value] of [
			['runIntervalMinutes', runIntervalMinutes],
			['reconcileIntervalSeconds', reconcileIntervalSeconds],
			['tmdbRefreshIntervalMinutes', tmdbRefreshIntervalMinutes],
			['apiPort', apiPort]
		] as const) {
			const result = validateRuntimeBounds(field, value);
			if (!result.ok) {
				return fail(400, { runtimeMessage: result.message });
			}
		}

		const payload = {
			runtime: {
				runIntervalMinutes,
				reconcileIntervalSeconds,
				tmdbRefreshIntervalMinutes: tmdbRefreshIntervalMinutes ?? 0,
				...(apiPort === undefined ? {} : { apiPort })
			},
			tv: { shows: currentShows }
		};

		try {
			const response = await apiRequest('/api/config', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`,
					'if-match': ifMatch
				},
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				let runtimeMessage = `Save failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) runtimeMessage = body.error;
				} catch {
					// keep fallback message
				}
				return fail(response.status, { runtimeMessage, runtimeEtag: response.headers.get('etag') });
			}

			return {
				runtimeSuccess: true,
				message: 'Runtime settings saved.',
				runtimeEtag: response.headers.get('etag')
			};
		} catch (error) {
			console.error('[config] saveRuntime failed:', error);
			return fail(500, { runtimeMessage: 'Could not save runtime settings.' });
		}
	},

	saveTvDefaults: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { tvDefaultsMessage: 'Config writes are disabled.' });
		}

		const formData = await request.formData();
		const ifMatch = String(formData.get('tvDefaultsIfMatch') ?? '').trim();
		if (!ifMatch) {
			return fail(400, { tvDefaultsMessage: 'Missing config revision. Reload and try again.' });
		}

		const resolutions = formData.getAll('tvResolution').map(String);
		const codecs = formData.getAll('tvCodec').map(String);

		const payload = { resolutions, codecs };

		try {
			const response = await apiRequest('/api/config/tv/defaults', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${writeToken}`,
					'if-match': ifMatch
				},
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				let tvDefaultsMessage = `Save failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) tvDefaultsMessage = body.error;
				} catch {
					// keep fallback message
				}
				return fail(response.status, {
					tvDefaultsMessage,
					tvDefaultsEtag: response.headers.get('etag')
				});
			}

			return {
				tvDefaultsSuccess: true,
				tvDefaultsMessage: 'TV defaults saved.',
				tvDefaultsEtag: response.headers.get('etag')
			};
		} catch (error) {
			console.error('[config] saveTvDefaults failed:', error);
			return fail(500, { tvDefaultsMessage: 'Could not save TV defaults.' });
		}
	},

	saveMovies: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { moviesMessage: 'Config writes are disabled.' });
		}

		const formData = await request.formData();
		const ifMatch = String(formData.get('moviesIfMatch') ?? '').trim();
		if (!ifMatch) {
			return fail(400, { moviesMessage: 'Missing config revision. Reload and try again.' });
		}

		const rawYears = formData.getAll('movieYear').map(String);
		const years: number[] = [];
		for (const y of rawYears) {
			const n = Number(y);
			if (!Number.isInteger(n) || n < 1900 || n > 2100) {
				return fail(400, { moviesMessage: 'Years must be whole numbers between 1900 and 2100.' });
			}
			years.push(n);
		}

		const resolutions = formData.getAll('movieResolution').map(String);
		const codecs = formData.getAll('movieCodec').map(String);
		const codecPolicy = String(formData.get('movieCodecPolicy') ?? '').trim();

		if (codecPolicy !== 'prefer' && codecPolicy !== 'require') {
			return fail(400, { moviesMessage: 'Codec policy must be "prefer" or "require".' });
		}

		const payload = { years, resolutions, codecs, codecPolicy };

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
				let moviesMessage = `Save failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) moviesMessage = body.error;
				} catch {
					// keep fallback message
				}
				return fail(response.status, {
					moviesMessage,
					moviesEtag: response.headers.get('etag')
				});
			}

			return {
				moviesSuccess: true,
				moviesMessage: 'Movies policy saved.',
				moviesEtag: response.headers.get('etag')
			};
		} catch (error) {
			console.error('[config] saveMovies failed:', error);
			return fail(500, { moviesMessage: 'Could not save movies policy.' });
		}
	},

	restartDaemon: async () => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (writeToken === undefined || writeToken === null) {
			return fail(401, { restartError: 'Write token not configured.' });
		}
		if (!writeToken) {
			return fail(403, { restartError: 'Config writes are disabled.' });
		}

		try {
			const response = await apiRequest('/api/daemon/restart', {
				method: 'POST',
				headers: {
					authorization: `Bearer ${writeToken}`
				}
			});

			if (!response.ok) {
				let restartError = `Restart failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) restartError = body.error;
				} catch {
					// keep fallback
				}
				return fail(response.status, { restartError });
			}

			return { restarted: true };
		} catch (error) {
			console.error('[config] restartDaemon failed:', error);
			return fail(502, { restartError: 'Could not reach the API to restart.' });
		}
	},

	testConnection: async () => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { pingError: 'write token not configured; cannot test connection' });
		}

		try {
			const [pingResponse, statusResponse] = await Promise.all([
				apiRequest('/api/transmission/ping', {
					method: 'POST',
					headers: { authorization: `Bearer ${writeToken}` }
				}),
				apiRequest('/api/setup/transmission/status')
			]);

			const status = statusResponse.ok
				? ((await statusResponse.json()) as TransmissionStatusResponse)
				: null;

			if (!pingResponse.ok) {
				let pingError = `Ping failed (${pingResponse.status}).`;
				try {
					const body = (await pingResponse.json()) as { error?: string };
					if (body.error) pingError = body.error;
				} catch {
					// keep fallback
				}
				return fail(502, {
					pingError,
					compatibility: status?.compatibility ?? 'not_reachable',
					transmissionAdvisory: status?.advisory ?? null
				});
			}

			const data = (await pingResponse.json()) as { version: string };
			return {
				pingOk: true,
				version: data.version,
				compatibility: status?.compatibility ?? 'compatible',
				transmissionAdvisory: status?.advisory ?? null
			};
		} catch (error) {
			console.error('[config] testConnection failed:', error);
			return fail(502, { pingError: 'Could not reach the API.' });
		}
	},

	saveFeeds: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(403, { feedsMessage: 'Config writes are disabled.' });
		}

		const formData = await request.formData();
		const ifMatch = String(formData.get('feedsIfMatch') ?? '').trim();
		if (!ifMatch) {
			return fail(400, { feedsMessage: 'Missing config revision. Reload and try again.' });
		}

		const existingFeedsJson = String(formData.get('existingFeedsJson') ?? '[]');
		let feeds: {
			name: string;
			url: string;
			mediaType: string;
			pollIntervalMinutes?: number;
			parserHints?: Record<string, unknown>;
		}[];
		try {
			const parsed = JSON.parse(existingFeedsJson);
			feeds = Array.isArray(parsed) ? parsed : [];
		} catch {
			feeds = [];
		}

		const newName = String(formData.get('newFeedName') ?? '').trim();
		const newUrl = String(formData.get('newFeedUrl') ?? '').trim();
		const newMediaType = String(formData.get('newFeedMediaType') ?? 'tv').trim();
		if (newUrl) {
			feeds.push({ name: newName, url: newUrl, mediaType: newMediaType });
		}

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
				let errorText = `Save failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) errorText = body.error;
				} catch {
					// keep fallback
				}
				if (response.status === 400) {
					return fail(400, {
						feedsUrlError: errorText,
						feedsEtag: response.headers.get('etag')
					});
				}
				return fail(response.status, {
					feedsMessage: errorText,
					feedsEtag: response.headers.get('etag')
				});
			}

			return {
				feedsSuccess: true,
				feedsMessage: 'Feeds saved.',
				feedsEtag: response.headers.get('etag')
			};
		} catch (error) {
			console.error('[config] saveFeeds failed:', error);
			return fail(500, { feedsMessage: 'Could not save feeds.' });
		}
	}
};
