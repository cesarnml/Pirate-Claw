import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import StatusChip from './StatusChip.svelte';

describe('StatusChip', () => {
	it('renders the supported vocabulary in uppercase form', () => {
		render(StatusChip, { status: 'skipped_no_match' });
		expect(screen.getByText('SKIPPED_NO_MATCH')).toBeInTheDocument();
	});

	it('falls back to uppercase for unknown statuses', () => {
		render(StatusChip, { status: 'custom_state' });
		expect(screen.getByText('CUSTOM_STATE')).toBeInTheDocument();
	});
});
