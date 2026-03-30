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
    codec === undefined ||
    !policy.years.includes(year) ||
    !matchesAllowedQuality(resolution, codec, policy.resolutions, policy.codecs)
  ) {
    return undefined;
  }

  return {
    ruleName: MOVIE_POLICY_RULE_NAME,
    identityKey: buildIdentityKey(item),
    score: scoreQualityPreference(
      resolution,
      codec,
      policy.resolutions,
      policy.codecs,
    ),
    reasons: [`year:${year}`, `resolution:${resolution}`, `codec:${codec}`],
    item,
  };
}

function buildIdentityKey(item: NormalizedFeedItem): string {
  return `movie:${item.normalizedTitle.trim().toLowerCase()}|${item.year ?? ''}`;
}
