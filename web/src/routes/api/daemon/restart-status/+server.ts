import { json } from '@sveltejs/kit';
import { apiRequest } from '$lib/server/api';

export const GET = async () => {
	try {
		const response = await apiRequest('/api/daemon/restart-status');
		return new Response(await response.text(), {
			status: response.status,
			headers: {
				'content-type': response.headers.get('content-type') ?? 'application/json'
			}
		});
	} catch (error) {
		console.error('[web] restart-status proxy failed:', error);
		return json({ error: 'Could not reach the API.' }, { status: 502 });
	}
};
