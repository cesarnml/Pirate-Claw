import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { apiRequest } from '$lib/server/api';
import type { AppConfig } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const response = await apiRequest('/api/config');
		if (!response.ok) {
			throw new Error(`config load failed: ${response.status}`);
		}

		const config = (await response.json()) as AppConfig;
		return {
			config,
			etag: response.headers.get('etag'),
			error: null
		};
	} catch (err) {
		console.error('[config] failed to load config:', err);
		return {
			config: null as AppConfig | null,
			etag: null as string | null,
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

export const actions: Actions = {
	saveRuntime: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken) {
			return fail(500, { message: 'Server write token is not configured.' });
		}

		const formData = await request.formData();
		const allowedFields = new Set([
			'ifMatch',
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

		const payload = {
			runtime: {
				runIntervalMinutes,
				reconcileIntervalMinutes,
				tmdbRefreshIntervalMinutes: tmdbRefreshIntervalMinutes ?? 0,
				...(apiPort === undefined ? {} : { apiPort })
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
				message: 'Settings saved. Restart the daemon for changes to take effect.',
				etag: response.headers.get('etag')
			};
		} catch (error) {
			console.error('[config] save failed:', error);
			return fail(500, { message: 'Could not save settings.' });
		}
	}
};
