import type { MoviePolicy } from './config';
import { matchesAllowedQuality, scoreQualityPreference } from './match-policy';
import type { NormalizedFeedItem } from './normalize';

export type MovieMatchResult = {
  ruleName: string;
  identityKey: string;
  score: number;
  reasons: string[];
  item: NormalizedFeedItem;
};

export const MOVIE_CODEC_POLICY_REQUIRE_MISSING_MESSAGE =
  'Movie codec is required by policy but missing from release title.';
export const MOVIE_CODEC_POLICY_REQUIRE_DISALLOWED_MESSAGE =
  'Movie codec is required by policy and release codec is not allowed.';

const MOVIE_POLICY_RULE_NAME = 'movies';

export function matchMovieItem(
  item: NormalizedFeedItem,
  policy: MoviePolicy,
): MovieMatchResult | undefined {
  const { year, resolution, codec } = item;

  if (
    item.mediaType !== 'movie' ||
    year === undefined ||
    resolution === undefined ||
    !policy.years.includes(year) ||
    !matchesMovieQuality(resolution, codec, policy)
  ) {
    return undefined;
  }

  return {
    ruleName: MOVIE_POLICY_RULE_NAME,
    identityKey: buildIdentityKey(item),
    score: scoreMovieQualityPreference(resolution, codec, policy),
    reasons: createReasons(year, resolution, codec),
    item,
  };
}

export function getMovieNoMatchReason(
  item: NormalizedFeedItem,
  policy: MoviePolicy,
): string | undefined {
  const { year, resolution, codec } = item;

  if (
    item.mediaType !== 'movie' ||
    year === undefined ||
    resolution === undefined ||
    !policy.years.includes(year) ||
    !policy.resolutions.includes(resolution) ||
    policy.codecPolicy !== 'require'
  ) {
    return undefined;
  }

  if (codec === undefined) {
    return MOVIE_CODEC_POLICY_REQUIRE_MISSING_MESSAGE;
  }

  if (!policy.codecs.includes(codec)) {
    return MOVIE_CODEC_POLICY_REQUIRE_DISALLOWED_MESSAGE;
  }

  return undefined;
}

function buildIdentityKey(item: NormalizedFeedItem): string {
  return `movie:${item.normalizedTitle.trim().toLowerCase()}|${item.year ?? ''}`;
}

function matchesMovieQuality(
  resolution: string,
  codec: string | undefined,
  policy: MoviePolicy,
): boolean {
  if (!policy.resolutions.includes(resolution)) {
    return false;
  }

  if (codec === undefined) {
    return policy.codecPolicy === 'prefer' && policy.codecs.length > 0;
  }

  return matchesAllowedQuality(
    resolution,
    codec,
    policy.resolutions,
    policy.codecs,
  );
}

function scoreMovieQualityPreference(
  resolution: string,
  codec: string | undefined,
  policy: MoviePolicy,
): number {
  if (codec === undefined) {
    const worstAllowedCodec = policy.codecs.at(-1);

    if (worstAllowedCodec === undefined) {
      return 0;
    }

    return (
      scoreQualityPreference(
        resolution,
        worstAllowedCodec,
        policy.resolutions,
        policy.codecs,
      ) - 1
    );
  }

  return scoreQualityPreference(
    resolution,
    codec,
    policy.resolutions,
    policy.codecs,
  );
}

function createReasons(
  year: number,
  resolution: string,
  codec: string | undefined,
): string[] {
  return [
    `year:${year}`,
    `resolution:${resolution}`,
    codec === undefined ? 'codec:unknown' : `codec:${codec}`,
  ];
}
