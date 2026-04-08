import { describe, expect, it } from 'bun:test';

import { movieMatchKey, tvMatchKey } from '../src/tmdb/keys';

describe('tmdb match keys', () => {
  it('builds stable movie keys with year', () => {
    expect(movieMatchKey('Some Film', 2024)).toBe('some film|2024');
  });

  it('builds movie keys without year', () => {
    expect(movieMatchKey('Unknown', undefined)).toBe('unknown|_');
  });

  it('normalizes tv keys', () => {
    expect(tvMatchKey('  My Show  ')).toBe('my show');
  });
});
