export function matchesAllowedQuality(
  resolution: string | undefined,
  codec: string | undefined,
  resolutions: string[],
  codecs: string[],
): boolean {
  return (
    resolution !== undefined &&
    codec !== undefined &&
    resolutions.includes(resolution) &&
    codecs.includes(codec)
  );
}

export function scoreQualityPreference(
  resolution: string,
  codec: string,
  resolutions: string[],
  codecs: string[],
): number {
  const resolutionIndex = resolutions.indexOf(resolution);
  const codecIndex = codecs.indexOf(codec);

  return (
    scoreResolution(resolutions.length, resolutionIndex) +
    scoreCodec(codecs.length, codecIndex)
  );
}

/**
 * Ranks one manual-search result (EZTV/ThePirateBay/YTS "Grab" flow) for
 * display ordering — reuses scoreResolution/scoreCodec's exact formula
 * (resolution dominates, a ~100-point tier gap; codec is a smaller
 * secondary preference) rather than duplicating it, but is a distinct
 * function from scoreQualityPreference on purpose: that one backs the RSS
 * pipeline's own candidate selection and must stay untouched by anything
 * manual-search-shaped (see grill-me: torrent queue/grab UX fixes,
 * 2026-09-01 — scope was deliberately manual-grab-only).
 *
 * Adds a seeds term (not peers — matches this codebase's own established
 * convention, see the "practical downloadability signal, not resolution" *
 * comment this scorer's callers replaced), capped well below one resolution
 * tier's 100-point gap so resolution always still dominates (matches
 * "always try 1080p/x265 first") — it only breaks ties within a tier, or
 * nudges below a codec preference, never overrides a resolution preference.
 * An unresolved/unrecognized resolution or codec (undefined, or not present
 * in the preference list — common for EZTV/ThePirateBay, whose resolution/
 * codec are parsed from a messy title and can come back empty) is scored as
 * the *worst* tier, not silently ignored — being unranked shouldn't outrank
 * every known preference.
 */
export function scoreManualSearchResult(
  resolution: string | undefined,
  codec: string | undefined,
  seeds: number,
  resolutions: string[],
  codecs: string[],
): number {
  const resolutionIndex =
    resolution !== undefined ? resolutions.indexOf(resolution) : -1;
  const codecIndex = codec !== undefined ? codecs.indexOf(codec) : -1;

  return (
    scoreResolution(
      resolutions.length,
      resolutionIndex === -1 ? resolutions.length : resolutionIndex,
    ) +
    scoreCodec(codecs.length, codecIndex === -1 ? codecs.length : codecIndex) +
    scoreSeeds(seeds)
  );
}

function scoreResolution(length: number, index: number): number {
  return (length - index) * 100;
}

function scoreCodec(length: number, index: number): number {
  return length - index - 1;
}

/** Log-scaled and capped at 40 — comfortably under a single resolution
 * tier's 100-point gap (resolution must always dominate), but large enough
 * to flip a codec-tier ordering (codec's own gap is typically just a few
 * points) when one result has meaningfully more seeds than another. */
function scoreSeeds(seeds: number): number {
  return Math.min(Math.log2(Math.max(seeds, 0) + 1) * 5, 40);
}
