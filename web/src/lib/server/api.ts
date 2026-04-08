import { env } from '$env/dynamic/private';

const baseUrl = (env.PIRATE_CLAW_API_URL ?? '').replace(/\/$/, '');

if (!baseUrl) {
	throw new Error('PIRATE_CLAW_API_URL is required but not set');
}

export async function apiFetch<T>(path: string): Promise<T> {
	const url = `${baseUrl}${path}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`API request failed: ${res.status} ${res.statusText} — ${url}`);
	}
	return res.json() as Promise<T>;
}
