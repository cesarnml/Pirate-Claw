import { render, screen, within } from '@testing-library/svelte';
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

		const nav = screen.getByRole('navigation', { name: 'Main navigation' });
		const sidebar = nav.closest('aside');
		expect(nav).toBeInTheDocument();
		expect(sidebar).not.toBeNull();

		const labels = ['Dashboard', 'TV Shows', 'Movies', 'Config'] as const;
		const hrefs = ['/', '/shows', '/movies', '/config'] as const;
		const sidebarQueries = within(sidebar as HTMLElement);

		for (let i = 0; i < labels.length; i++) {
			const link = sidebarQueries.getByRole('link', { name: labels[i] });
			expect(link).toHaveAttribute('href', hrefs[i]);
		}

		expect(sidebarQueries.getByText('Daemon')).toBeInTheDocument();
		expect(sidebarQueries.getByText('1h 1m 1s')).toBeInTheDocument();
		expect(sidebarQueries.getByText('Transmission')).toBeInTheDocument();
		expect(sidebarQueries.getByText('Connected')).toBeInTheDocument();
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

		const nav = screen.getByRole('navigation', { name: 'Main navigation' });
		const sidebar = nav.closest('aside');
		expect(sidebar).not.toBeNull();
		const sidebarQueries = within(sidebar as HTMLElement);

		expect(sidebarQueries.getAllByText('Unavailable')).toHaveLength(2);
		expect(sidebarQueries.getByText('Transmission')).toBeInTheDocument();
	});
});
