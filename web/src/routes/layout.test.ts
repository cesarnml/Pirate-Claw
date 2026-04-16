import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { DaemonHealth, SessionInfo } from '$lib/types';
import Layout from './+layout.svelte';

vi.mock('$lib/components/ui/sonner', () => ({
	Toaster: vi.fn()
}));

const mockHealth: DaemonHealth = {
	uptime: 3661000,
	startedAt: '2024-01-01T00:00:00Z'
};

const mockSession: SessionInfo = {
	version: '3.00 (bb6b5a062ef)',
	downloadSpeed: 0,
	uploadSpeed: 0,
	activeTorrentCount: 0
};

describe('+layout.svelte', () => {
	it('renders the phase 19 shell nav and footer status strip', () => {
		render(Layout, {
			props: {
				children: (() => {}) as unknown as import('svelte').Snippet,
				data: {
					health: mockHealth,
					transmissionSession: mockSession
				}
			}
		});

		expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();

		const labels = ['Dashboard', 'TV Shows', 'Movies', 'Config'] as const;
		const hrefs = ['/', '/shows', '/movies', '/config'] as const;

		for (let i = 0; i < labels.length; i++) {
			const links = screen.getAllByRole('link', { name: labels[i] });
			expect(links[0]).toHaveAttribute('href', hrefs[i]);
		}

		expect(screen.getAllByText('Daemon')[0]).toBeInTheDocument();
		expect(screen.getAllByText('1h 1m 1s')[0]).toBeInTheDocument();
		expect(screen.getAllByText('Transmission')[0]).toBeInTheDocument();
		expect(screen.getAllByText('Connected')[0]).toBeInTheDocument();
	});

	it('surfaces unavailable shell status when shared API data is missing', () => {
		render(Layout, {
			props: {
				children: (() => {}) as unknown as import('svelte').Snippet,
				data: {
					health: null,
					transmissionSession: null
				}
			}
		});

		expect(screen.getAllByText('Unavailable')[0]).toBeInTheDocument();
		expect(screen.getAllByText('Transmission')[0]).toBeInTheDocument();
	});
});
