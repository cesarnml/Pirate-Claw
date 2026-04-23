import { describe, expect, it, vi } from 'vitest';
import {
	RESTART_RETURN_TIMEOUT_MS,
	loadRestartRoundTripPhase
} from '../../src/lib/restart-roundtrip';

describe('loadRestartRoundTripPhase', () => {
	const requestedAt = '2026-04-23T10:00:00.000Z';
	const justAfterRequestedAt = Date.parse(requestedAt) + 1_000;

	it('keeps the flow in requested while the same restart request is still pending', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					state: 'requested',
					requestId: 'restart-123',
					requestedAt,
					requestedByStartedAt: requestedAt,
					currentDaemonStartedAt: requestedAt
				}),
				{ status: 200 }
			)
		);

		await expect(
			loadRestartRoundTripPhase('restart-123', requestedAt, fetchMock, justAfterRequestedAt)
		).resolves.toBe('requested');
	});

	it('returns failed_to_return when the same request id is still pending after the timeout', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					state: 'requested',
					requestId: 'restart-123',
					requestedAt,
					requestedByStartedAt: requestedAt,
					currentDaemonStartedAt: requestedAt
				}),
				{ status: 200 }
			)
		);

		await expect(
			loadRestartRoundTripPhase(
				'restart-123',
				requestedAt,
				fetchMock,
				Date.parse(requestedAt) + RESTART_RETURN_TIMEOUT_MS
			)
		).resolves.toBe('failed_to_return');
	});

	it('treats API downtime as restarting after the request was accepted', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error('connection refused'));

		await expect(
			loadRestartRoundTripPhase('restart-123', requestedAt, fetchMock, justAfterRequestedAt)
		).resolves.toBe('restarting');
	});

	it('returns back_online when the restarted daemon proves the same request id', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					state: 'back_online',
					requestId: 'restart-123',
					requestedAt,
					requestedByStartedAt: requestedAt,
					returnedAt: '2026-04-23T10:00:05.000Z',
					returnedStartedAt: '2026-04-23T10:00:05.000Z',
					currentDaemonStartedAt: '2026-04-23T10:00:05.000Z'
				}),
				{ status: 200 }
			)
		);

		await expect(
			loadRestartRoundTripPhase('restart-123', requestedAt, fetchMock, justAfterRequestedAt)
		).resolves.toBe('back_online');
	});

	it('returns failed_to_return after the timeout expires while the daemon stays unavailable', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error('connection refused'));

		await expect(
			loadRestartRoundTripPhase(
				'restart-123',
				requestedAt,
				fetchMock,
				Date.parse(requestedAt) + RESTART_RETURN_TIMEOUT_MS
			)
		).resolves.toBe('failed_to_return');
	});

	it('stays restarting just below the timeout threshold', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error('connection refused'));

		await expect(
			loadRestartRoundTripPhase(
				'restart-123',
				requestedAt,
				fetchMock,
				Date.parse(requestedAt) + RESTART_RETURN_TIMEOUT_MS - 1
			)
		).resolves.toBe('restarting');
	});

	it('treats an invalid requestedAt timestamp as timed out', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error('connection refused'));

		await expect(
			loadRestartRoundTripPhase('restart-123', 'not-a-timestamp', fetchMock)
		).resolves.toBe('failed_to_return');
	});
});
