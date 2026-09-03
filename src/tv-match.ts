import type { TvRule } from './config';
import { matchesAllowedQuality, scoreQualityPreference } from './match-policy';
import type { NormalizedFeedItem } from './normalize';

export type TvMatchResult = {
  ruleName: string;
  identityKey: string;
  score: number;
  reasons: string[];
  item: NormalizedFeedItem;
};

export function matchTvItem(
  item: NormalizedFeedItem,
  rules: TvRule[],
): TvMatchResult[] {
  if (
    item.mediaType !== 'tv' ||
    item.season === undefined ||
    item.episode === undefined ||
    item.resolution === undefined ||
    item.codec === undefined
  ) {
    return [];
  }

  const identityKey = buildIdentityKey(item);

  return rules
    .map((rule) => {
      const pattern = buildRulePattern(rule);
      const match = matchRule(item, rule, pattern);

      if (!match) {
        return undefined;
      }

      return {
        ruleName: rule.name,
        identityKey,
        score: scoreMatch(rule, item),
        reasons: [
          `pattern:${pattern.source}`,
          `resolution:${item.resolution}`,
          `codec:${item.codec}`,
        ],
        item,
      } satisfies TvMatchResult;
    })
    .filter((match): match is TvMatchResult => match !== undefined)
    .sort((left, right) => right.score - left.score);
}

function matchRule(
  item: NormalizedFeedItem,
  rule: TvRule,
  pattern: RegExp,
): boolean {
  if (!pattern.test(item.normalizedTitle)) {
    return false;
  }

  return matchesAllowedQuality(
    item.resolution,
    item.codec,
    rule.resolutions,
    rule.codecs,
  );
}

function buildRulePattern(rule: TvRule): RegExp {
  return new RegExp(rule.matchPattern ?? deriveMatchPattern(rule.name), 'i');
}

function deriveMatchPattern(name: string): string {
  const normalizedName = name
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/[()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ');
  const tokens = normalizedName
    .split(' ')
    .map((token) => escapeForRegex(token))
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return '^$';
  }

  // Single-word rule names (e.g. "From") are where generic titles cause
  // real overmatch: boundary-matching anywhere in the title lets the word
  // float and match unrelated releases whose title happens to contain it
  // (e.g. "Escape From New York"). Require an exact whole-title match
  // instead — normalizedTitle (everything before the S/E marker) must be
  // just that one word, nothing else. Multi-word rule names are already
  // specific enough that this isn't a real risk, and reverting them to
  // boundary matching preserves legitimate tolerance for extra words
  // adjacent to the title, e.g. "Example Show" still matching a release
  // titled "Example Show UK". Overmatch found and fixed 2026-08-27.
  if (tokens.length === 1) {
    return `^${tokens[0]}$`;
  }

  return `(?:^| )${tokens.join(' +')}(?:$| )`;
}

/** The identity a TV release is deduplicated on. Exported so the manual-grab
 * ledger can build the same key for its own rows (see
 * Repository.listActiveManualGrabIdentityKeys) — a manual grab and an RSS
 * candidate for the same episode must collide here, or the feed re-downloads
 * something the operator already pulled by hand. */
export function buildTvIdentityKey(input: {
  normalizedTitle: string;
  season: number | undefined;
  episode: number | undefined;
}): string {
  return `tv:${input.normalizedTitle.toLowerCase()}|s${padNumber(input.season)}e${padNumber(input.episode)}`;
}

function buildIdentityKey(item: NormalizedFeedItem): string {
  return buildTvIdentityKey({
    normalizedTitle: item.normalizedTitle,
    season: item.season,
    episode: item.episode,
  });
}

function scoreMatch(rule: TvRule, item: NormalizedFeedItem): number {
  return scoreQualityPreference(
    item.resolution ?? '',
    item.codec ?? '',
    rule.resolutions,
    rule.codecs,
  );
}

function padNumber(value: number | undefined): string {
  return String(value ?? '').padStart(2, '0');
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
