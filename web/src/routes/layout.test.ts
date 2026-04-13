import { render } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import Layout from './+layout.svelte';

vi.mock('$lib/components/ui/sonner', () => ({
	Toaster: vi.fn()
}));

describe('+layout.svelte', () => {
	it('renders nav links for home and all main routes including Movies', () => {
		const { getByRole } = render(Layout, {
			props: { children: (() => {}) as unknown as import('svelte').Snippet }
		});

		const home = getByRole('link', { name: 'Home' });
		expect(home).toHaveAttribute('href', '/');

		const labels = ['Candidates', 'Shows', 'Movies', 'Config'] as const;
		const hrefs = ['/candidates', '/shows', '/movies', '/config'] as const;

		for (let i = 0; i < labels.length; i++) {
			const link = getByRole('link', { name: labels[i] });
			expect(link).toHaveAttribute('href', hrefs[i]);
		}
	});
});
