import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import Layout from './+layout.svelte';

describe('+layout.svelte', () => {
	it('renders nav links for all four routes', () => {
		const { getByRole } = render(Layout, {
			props: { children: (() => {}) as unknown as import('svelte').Snippet }
		});

		const links = ['Home', 'Candidates', 'Shows', 'Config'].map((label) =>
			getByRole('link', { name: label })
		);

		expect(links[0]).toHaveAttribute('href', '/');
		expect(links[1]).toHaveAttribute('href', '/candidates');
		expect(links[2]).toHaveAttribute('href', '/shows');
		expect(links[3]).toHaveAttribute('href', '/config');
	});
});
