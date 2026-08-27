import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../../../src/routes/calendar/+page.svelte';
import type { CalendarTvItem } from '../../../src/routes/calendar/+page.server';

vi.mock('svelte-sonner', () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn()
	},
	Toaster: vi.fn()
}));

// jsdom has no IntersectionObserver. The component only needs to register an
// observer and hand back a way to fire it, so a minimal stub is enough — the
// real browser behavior (viewport intersection) is out of scope here.
type ObserverCallback = (
	entries: IntersectionObserverEntry[],
	observer: IntersectionObserver
) => void;

class FakeIntersectionObserver {
	static instances: FakeIntersectionObserver[] = [];
	callback: ObserverCallback;
	constructor(callback: ObserverCallback) {
		this.callback = callback;
		FakeIntersectionObserver.instances.push(this);
	}
	observe() {}
	disconnect() {}
	unobserve() {}
	trigger() {
		this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
	}
}

function item(overrides: Partial<CalendarTvItem> = {}): CalendarTvItem {
	return {
		tmdbId: 1,
		name: 'Show',
		firstAirDate: '2026-01-10',
		overview: 'An overview.',
		posterUrl: null,
		popularity: 1,
		alreadyTracked: false,
		...overrides
	};
}

function jsonResponse(status: number, body: unknown) {
	return Promise.resolve(
		new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
	);
}

const baseData = {
	// Shared +layout.server.ts data merged into every page's PageData.
	user: null,
	untrustedOrigin: null,
	networkPosture: null,
	health: null,
	transmissionSession: null,
	plexAuthState: 'unavailable' as const,
	setupState: 'ready' as const,
	readinessState: 'ready' as const,
	installHealthState: null,
	// Calendar page's own data.
	year: 2026,
	items: [item({ tmdbId: 1, name: 'January Show', firstAirDate: '2026-01-10' })],
	total: 1,
	offset: 0,
	tmdbConfigured: true,
	error: null
};

describe('calendar page — client-side pagination', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
		FakeIntersectionObserver.instances = [];
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('rolls forward into the next year when the current year is exhausted', async () => {
		fetchMock.mockReturnValueOnce(
			jsonResponse(200, {
				year: 2027,
				items: [item({ tmdbId: 2, name: 'Next Year Show', firstAirDate: '2027-02-01' })],
				total: 1,
				offset: 0
			})
		);

		render(Page, { data: baseData });
		expect(screen.getByText('January Show')).toBeInTheDocument();

		FakeIntersectionObserver.instances[0].trigger();

		await waitFor(() => expect(screen.getByText('Next Year Show')).toBeInTheDocument());

		const requestedUrl = fetchMock.mock.calls[0][0] as string;
		expect(requestedUrl).toContain('year=2027');
		expect(requestedUrl).toContain('offset=0');
	});

	it('skips an empty year before landing on the next year that has items', async () => {
		fetchMock
			.mockReturnValueOnce(jsonResponse(200, { year: 2027, items: [], total: 0, offset: 0 }))
			.mockReturnValueOnce(
				jsonResponse(200, {
					year: 2028,
					items: [item({ tmdbId: 3, name: 'Two Years Out', firstAirDate: '2028-03-01' })],
					total: 1,
					offset: 0
				})
			);

		render(Page, { data: baseData });
		FakeIntersectionObserver.instances[0].trigger();

		await waitFor(() => expect(screen.getByText('Two Years Out')).toBeInTheDocument());
		expect(fetchMock.mock.calls[0][0]).toContain('year=2027');
		expect(fetchMock.mock.calls[1][0]).toContain('year=2028');
	});

	it('prepends earlier months and, at the start of the year, rolls into the previous year with offset omitted', async () => {
		fetchMock.mockReturnValueOnce(
			jsonResponse(200, {
				year: 2025,
				items: [item({ tmdbId: 4, name: 'Last December', firstAirDate: '2025-12-20' })],
				total: 40,
				offset: 24
			})
		);

		render(Page, { data: { ...baseData, offset: 0 } });

		const button = screen.getByRole('button', { name: /load earlier months/i });
		await fireEvent.click(button);

		await waitFor(() => expect(screen.getByText('Last December')).toBeInTheDocument());

		const requestedUrl = fetchMock.mock.calls[0][0] as string;
		expect(requestedUrl).toContain('year=2025');
		// Critical: offset must be omitted (not defaulted to 0) so the daemon's
		// auto-anchor lands on the previous year's *last* page.
		expect(requestedUrl).not.toContain('offset=');
	});

	it('shows a retry control and surfaces the error when a forward fetch fails', async () => {
		fetchMock.mockReturnValueOnce(Promise.resolve(new Response('boom', { status: 500 })));

		render(Page, { data: baseData });
		FakeIntersectionObserver.instances[0].trigger();

		await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument());
	});

	it('stops after exhausting empty-year hops and marks the future end reached', async () => {
		for (let i = 0; i < 7; i++) {
			fetchMock.mockReturnValueOnce(
				jsonResponse(200, { year: 2027 + i, items: [], total: 0, offset: 0 })
			);
		}

		render(Page, { data: baseData });
		FakeIntersectionObserver.instances[0].trigger();

		await waitFor(() => expect(screen.getByText(/nothing further found/i)).toBeInTheDocument());
	});
});
