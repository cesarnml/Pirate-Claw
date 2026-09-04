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

  // Every rule name — one word or many — gets the same tolerant boundary
  // pattern, so a release title carrying extra words still matches:
  // "Example Show" matches "Example Show UK", and "Lanterns" matches
  // "Lanterns 2026".
  //
  // Single-word names briefly got an anchored `^name$` instead (2026-08-27),
  // to stop a rule named "From" matching "Escape From New York". That cured
  // the overmatch and caused a far bigger silent undermatch: scene releases
  // routinely append the premiere year, so `^lanterns$` never matches
  // "Lanterns 2026" — and 27 of the 75 shows on the live watchlist are
  // single-word names. Measured against stored feed history, the anchor was
  // costing real episodes (Lioness, Lanterns) while protecting exactly one
  // hypothetical rule.
  //
  // Overmatch is now the operator's call, not an inference from word count:
  // the Config page's per-show "Strict" toggle writes an explicit anchored
  // matchPattern for the handful of genuinely generic names. That is both
  // more precise (it knows which names are ambiguous, which token counting
  // cannot) and visible in the UI, where a silently-anchored pattern was not.
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
