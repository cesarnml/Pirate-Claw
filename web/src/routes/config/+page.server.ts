import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { apiRequest } from '$lib/server/api';
import type { AppConfig } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const canWrite = !!env.PIRATE_CLAW_API_WRITE_TOKEN;
	try {
		const response = await apiRequest('/api/config');
		if (!response.ok) {
			throw new Error(`config load failed: ${response.status}`);
		}

		const config = (await response.json()) as AppConfig;
		return {
			config,
			etag: response.headers.get('etag'),
			canWrite,
			error: null
		};
	} catch (err) {
		console.error('[config] failed to load config:', err);
		return {
			config: null as AppConfig | null,
			etag: null as string | null,
			canWrite,
			error: 'Could not reach the API.'
		};
	}
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

	if (field === 'runIntervalMinutes' || field === 'reconcileIntervalMinutes') {
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
	saveSettings: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(500, { message: 'Server write token is not configured.' });
		}

		const formData = await request.formData();
		const allowedFields = new Set([
			'ifMatch',
			'showName',
			'runIntervalMinutes',
			'reconcileIntervalMinutes',
			'tmdbRefreshIntervalMinutes',
			'apiPort'
		]);
		for (const key of formData.keys()) {
			if (!allowedFields.has(key)) {
				return fail(400, { message: `Field "${key}" is not allowed.` });
			}
		}

		const ifMatch = String(formData.get('ifMatch') ?? '').trim();
		if (!ifMatch) {
			return fail(400, { message: 'Missing config revision. Reload and try again.' });
		}

		const rawShowNames = formData.getAll('showName').map((v) => String(v).trim());
		const showNames = rawShowNames.filter((n) => n.length > 0);
		if (showNames.length < 1) {
			return fail(400, { message: 'At least one TV show name is required.' });
		}

		const runIntervalMinutes = parseOptionalInt(formData.get('runIntervalMinutes'));
		const reconcileIntervalMinutes = parseOptionalInt(formData.get('reconcileIntervalMinutes'));
		const tmdbRefreshIntervalMinutes = parseOptionalInt(formData.get('tmdbRefreshIntervalMinutes'));
		const apiPort = parseOptionalInt(formData.get('apiPort'));

		const invalidRuntimeField = [
			runIntervalMinutes,
			reconcileIntervalMinutes,
			tmdbRefreshIntervalMinutes,
			apiPort
		].some((value) => Number.isNaN(value));
		if (invalidRuntimeField) {
			return fail(400, { message: 'Runtime fields must be whole numbers.' });
		}

		for (const [field, value] of [
			['runIntervalMinutes', runIntervalMinutes],
			['reconcileIntervalMinutes', reconcileIntervalMinutes],
			['tmdbRefreshIntervalMinutes', tmdbRefreshIntervalMinutes],
			['apiPort', apiPort]
		] as const) {
			const result = validateRuntimeBounds(field, value);
			if (!result.ok) {
				return fail(400, { message: result.message });
			}
		}

		const payload = {
			runtime: {
				runIntervalMinutes,
				reconcileIntervalMinutes,
				tmdbRefreshIntervalMinutes: tmdbRefreshIntervalMinutes ?? 0,
				...(apiPort === undefined ? {} : { apiPort })
			},
			tv: {
				shows: showNames
			}
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
				let message = `Save failed (${response.status}).`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) message = body.error;
				} catch {
					// keep fallback message
				}
				return fail(response.status, {
					message,
					etag: response.headers.get('etag')
				});
			}

			return {
				success: true,
				message:
					'Settings saved. TV show list updates apply on the next daemon run cycle. Restart the daemon to apply a new API port or timer intervals.',
				etag: response.headers.get('etag')
			};
		} catch (error) {
			console.error('[config] save failed:', error);
			return fail(500, { message: 'Could not save settings.' });
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
	}
};
