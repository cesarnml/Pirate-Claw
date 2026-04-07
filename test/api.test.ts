import { describe, expect, it } from 'bun:test';

import { createApiFetch } from '../src/api';

describe('createApiFetch', () => {
  it('returns 404 for any request', () => {
    const handler = createApiFetch();
    const response = handler(new Request('http://localhost/anything'));

    expect(response.status).toBe(404);
  });

  it('returns JSON error body', async () => {
    const handler = createApiFetch();
    const response = handler(new Request('http://localhost/anything'));
    const body = await response.json();

    expect(body).toEqual({ error: 'not found' });
  });
});
