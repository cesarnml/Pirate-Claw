import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { apiRequest } from '$lib/server/api';
import { log } from '$lib/server/log';
import type { AuthStateResult } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

type VpnVerifyStatus = 'vpn_bridge_active' | 'vpn_bridge_unreachable' | 'passthrough';

async function readDaemonError(response: Response, fallback: string): Promise<string> {
	try {
		const body = (await response.json()) as { error?: string };
		return body.error ?? fallback;
	} catch {
		return fallback;
	}
}

function writeHeaders(contentType = 'application/json'): Record<string, string> {
	const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
	return {
		authorization: `Bearer ${writeToken}`,
		'content-type': contentType
	};
}

export const load: PageServerLoad = async () => {
	const canWrite = !!env.PIRATE_CLAW_API_WRITE_TOKEN;
	const [composeResult, authStateResult] = await Promise.allSettled([
		apiRequest('/api/vpn/compose'),
		apiRequest('/api/auth/state')
	]);

	const hasProfile = composeResult.status === 'fulfilled' && composeResult.value.ok;
	let networkPosture: AuthStateResult['network_posture'] | null = null;

	if (authStateResult.status === 'fulfilled' && authStateResult.value.ok) {
		const authState = (await authStateResult.value.json()) as AuthStateResult;
		networkPosture = authState.network_posture;
	}

	log('info', {
		event: 'downloader_network_load',
		message: '[web] downloader-network load',
		hasProfile,
		hasCredentials: false,
		posture: networkPosture ?? 'unknown'
	});

	return {
		canWrite,
		hasProfile,
		hasCredentials: false,
		networkPosture
	};
};

export const actions: Actions = {
	saveProfile: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken)
			return fail(403, {
				profileMessage: 'Config writes are disabled.',
				profileMessageTone: 'error'
			});

		const formData = await request.formData();
		const file = formData.get('profile');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, {
				profileMessage: 'Choose an .ovpn profile file.',
				profileMessageTone: 'error'
			});
		}

		try {
			const profileBytes =
				'arrayBuffer' in file && typeof file.arrayBuffer === 'function'
					? new Uint8Array(await file.arrayBuffer())
					: 'text' in file && typeof file.text === 'function'
						? new TextEncoder().encode(await file.text())
						: new TextEncoder().encode(String(file));
			const response = await apiRequest('/api/vpn/profile', {
				method: 'POST',
				headers: writeHeaders(file.type || 'application/x-openvpn-profile'),
				body: profileBytes
			});

			if (!response.ok) {
				return fail(response.status, {
					profileMessage: await readDaemonError(
						response,
						`Profile save failed (${response.status}).`
					),
					profileMessageTone: 'error'
				});
			}

			return {
				profileMessage: 'Profile saved.',
				profileMessageTone: 'success',
				hasProfile: true
			};
		} catch (error) {
			console.error('[web] vpn profile action failed:', error);
			return fail(500, {
				profileMessage: 'Could not save VPN profile.',
				profileMessageTone: 'error'
			});
		}
	},

	saveCredentials: async ({ request }) => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken)
			return fail(403, {
				credentialsMessage: 'Config writes are disabled.',
				credentialsMessageTone: 'error'
			});

		const formData = await request.formData();
		const username = String(formData.get('username') ?? '').trim();
		const password = String(formData.get('password') ?? '');

		if (!username || !password.trim()) {
			return fail(400, {
				credentialsMessage: 'VPN username and password are required.',
				credentialsMessageTone: 'error',
				username
			});
		}

		try {
			const response = await apiRequest('/api/vpn/credentials', {
				method: 'POST',
				headers: writeHeaders(),
				body: JSON.stringify({ username, password })
			});

			if (!response.ok) {
				return fail(response.status, {
					credentialsMessage: await readDaemonError(
						response,
						`Credentials save failed (${response.status}).`
					),
					credentialsMessageTone: 'error',
					username
				});
			}

			return {
				credentialsMessage: 'Credentials saved.',
				credentialsMessageTone: 'success',
				username,
				hasCredentials: true
			};
		} catch (error) {
			console.error('[web] vpn credentials action failed:', error);
			return fail(500, {
				credentialsMessage: 'Could not save VPN credentials.',
				credentialsMessageTone: 'error',
				username
			});
		}
	},

	verify: async () => {
		const writeToken = env.PIRATE_CLAW_API_WRITE_TOKEN;
		if (!writeToken)
			return fail(403, {
				verifyMessage: 'Config writes are disabled.',
				verifyMessageTone: 'error'
			});

		try {
			const response = await apiRequest('/api/vpn/verify', {
				method: 'POST',
				headers: { authorization: `Bearer ${writeToken}` }
			});

			if (!response.ok) {
				return fail(response.status, {
					verifyMessage: await readDaemonError(response, `Verify failed (${response.status}).`),
					verifyMessageTone: 'error'
				});
			}

			const body = (await response.json()) as { status?: VpnVerifyStatus };
			const status = body.status ?? 'vpn_bridge_unreachable';

			log('info', {
				event: 'vpn_verify_action',
				message: '[web] vpn-verify action',
				result: status
			});

			return {
				verifyStatus: status,
				verifyMessage:
					status === 'vpn_bridge_active'
						? 'VPN bridge verified.'
						: status === 'passthrough'
							? 'Bundled Transmission is still in passthrough mode.'
							: 'VPN bridge is unreachable.',
				verifyMessageTone: status === 'vpn_bridge_active' ? 'success' : 'error'
			};
		} catch (error) {
			console.error('[web] vpn verify action failed:', error);
			return fail(500, {
				verifyMessage: 'Could not verify VPN connection.',
				verifyMessageTone: 'error'
			});
		}
	}
};
