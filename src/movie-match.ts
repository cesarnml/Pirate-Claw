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
    return policy.codecs.length > 0;
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
