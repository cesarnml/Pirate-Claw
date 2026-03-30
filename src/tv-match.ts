import type { TvRule } from './config';
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

  return (
    rule.resolutions.includes(item.resolution ?? '') &&
    rule.codecs.includes(item.codec ?? '')
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

  return `(?:^| )${tokens.join(' +')}(?:$| )`;
}

function buildIdentityKey(item: NormalizedFeedItem): string {
  return `tv:${item.normalizedTitle.toLowerCase()}|s${padNumber(item.season)}e${padNumber(item.episode)}`;
}

function scoreMatch(rule: TvRule, item: NormalizedFeedItem): number {
  const resolutionIndex = rule.resolutions.indexOf(item.resolution ?? '');
  const codecIndex = rule.codecs.indexOf(item.codec ?? '');

  return (
    scoreResolution(rule.resolutions.length, resolutionIndex) +
    scoreCodec(rule.codecs.length, codecIndex)
  );
}

function scoreResolution(length: number, index: number): number {
  return (length - index) * 100;
}

function scoreCodec(length: number, index: number): number {
  return length - index - 1;
}

function padNumber(value: number | undefined): string {
  return String(value ?? '').padStart(2, '0');
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
