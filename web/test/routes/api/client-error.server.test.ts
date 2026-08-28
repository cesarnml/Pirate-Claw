import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiRequest: apiRequestMock
}));

function jsonRequest(body: unknown): Request {
	return new Request('http://localhost/api/client-error', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

describe('/api/client-error', () => {
	beforeEach(() => {
		apiRequestMock.mockReset();
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it('logs locally and forwards to the daemon when a write token is configured', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));
		apiRequestMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { POST } = await import('../../../src/routes/api/client-error/+server');

		const response = await POST({
			request: jsonRequest({
				message: 'each_key_duplicate',
				stack: 'Error: ...',
				url: 'http://100.108.117.42:8888/calendar',
				label: 'calendar'
			})
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(consoleError).toHaveBeenCalledWith(
			'[client-error] [calendar] each_key_duplicate',
			'(http://100.108.117.42:8888/calendar)',
			'Error: ...'
		);
		expect(apiRequestMock).toHaveBeenCalledWith(
			'/api/client-error',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({ authorization: 'Bearer write-token' })
			})
		);
	});

	it('still logs and returns ok when no write token is configured, without calling the daemon', async () => {
		vi.doMock('$env/dynamic/private', () => ({ env: {} }));
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { POST } = await import('../../../src/routes/api/client-error/+server');

		const response = await POST({
			request: jsonRequest({ message: 'boom' })
		} as never);

		expect(response.status).toBe(200);
		expect(consoleError).toHaveBeenCalled();
		expect(apiRequestMock).not.toHaveBeenCalled();
	});

	it('degrades gracefully when the daemon forward fails', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));
		apiRequestMock.mockRejectedValue(new Error('connection refused'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { POST } = await import('../../../src/routes/api/client-error/+server');

		const response = await POST({
			request: jsonRequest({ message: 'boom' })
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});

	it('returns 400 for an unparseable body instead of throwing', async () => {
		vi.doMock('$env/dynamic/private', () => ({ env: {} }));
		const { POST } = await import('../../../src/routes/api/client-error/+server');

		const response = await POST({
			request: new Request('http://localhost/api/client-error', {
				method: 'POST',
				body: 'not json'
			})
		} as never);

		expect(response.status).toBe(400);
	});
});
