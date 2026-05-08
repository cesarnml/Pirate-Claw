import { apiRequest } from '$lib/server/api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const response = await apiRequest('/api/vpn/compose');
	if (!response.ok) {
		return new Response(await response.text(), {
			status: response.status,
			headers: {
				'content-type': response.headers.get('content-type') ?? 'application/json'
			}
		});
	}

	return new Response(await response.text(), {
		headers: {
			'content-type': response.headers.get('content-type') ?? 'application/yaml',
			'content-disposition':
				response.headers.get('content-disposition') ?? 'attachment; filename=compose.synology.yml'
		}
	});
};
