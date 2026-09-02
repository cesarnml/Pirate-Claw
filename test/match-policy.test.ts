import { describe, expect, it } from 'bun:test';

import {
  scoreManualSearchResult,
  scoreQualityPreference,
} from '../src/match-policy';

const RESOLUTIONS = ['1080p', '720p'];
const CODECS = ['x265', 'x264'];

describe('scoreQualityPreference (RSS pipeline) — untouched by the manual-search scorer', () => {
  it('still ranks a preferred resolution/codec highest', () => {
    const best = scoreQualityPreference('1080p', 'x265', RESOLUTIONS, CODECS);
    const worst = scoreQualityPreference('720p', 'x264', RESOLUTIONS, CODECS);
    expect(best).toBeGreaterThan(worst);
  });
});

describe('scoreManualSearchResult', () => {
  it('ranks a preferred resolution above every other resolution, regardless of seeds', () => {
    // Grill-me: "always try for 1080p, x265 ... resolution dominates" —
    // even a 720p result with a huge seed count must not outrank a 1080p
    // result with almost none.
    const preferred1080pFewSeeds = scoreManualSearchResult(
      '1080p',
      'x264',
      1,
      RESOLUTIONS,
      CODECS,
    );
    const lowerRes720pManySeeds = scoreManualSearchResult(
      '720p',
      'x265',
      100_000,
      RESOLUTIONS,
      CODECS,
    );
    expect(preferred1080pFewSeeds).toBeGreaterThan(lowerRes720pManySeeds);
  });

  it('lets seeds break a tie within the same resolution/codec tier', () => {
    const fewSeeds = scoreManualSearchResult(
      '1080p',
      'x265',
      2,
      RESOLUTIONS,
      CODECS,
    );
    const manySeeds = scoreManualSearchResult(
      '1080p',
      'x265',
      5000,
      RESOLUTIONS,
      CODECS,
    );
    expect(manySeeds).toBeGreaterThan(fewSeeds);
  });

  it('lets a large seed advantage outrank a same-resolution codec preference', () => {
    const preferredCodecFewSeeds = scoreManualSearchResult(
      '1080p',
      'x265',
      1,
      RESOLUTIONS,
      CODECS,
    );
    const otherCodecManySeeds = scoreManualSearchResult(
      '1080p',
      'x264',
      5000,
      RESOLUTIONS,
      CODECS,
    );
    expect(otherCodecManySeeds).toBeGreaterThan(preferredCodecFewSeeds);
  });

  it('scores an unrecognized/undefined resolution as the worst tier, not the best', () => {
    // EZTV/ThePirateBay titles don't always parse cleanly — an unranked
    // result (resolutions.indexOf === -1) must not accidentally win by
    // scoring as if it were "beyond the most-preferred" entry.
    const unknown = scoreManualSearchResult(
      undefined,
      undefined,
      0,
      RESOLUTIONS,
      CODECS,
    );
    const knownWorst = scoreManualSearchResult(
      '720p',
      'x264',
      0,
      RESOLUTIONS,
      CODECS,
    );
    expect(unknown).toBeLessThanOrEqual(knownWorst);
  });
});
