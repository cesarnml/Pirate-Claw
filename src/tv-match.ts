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
      const match = matchRule(item, rule);

      if (!match) {
        return undefined;
      }

      return {
        ruleName: rule.name,
        identityKey,
        score: scoreMatch(rule, item),
        reasons: [
          `pattern:${rule.pattern}`,
          `resolution:${item.resolution}`,
          `codec:${item.codec}`,
        ],
        item,
      } satisfies TvMatchResult;
    })
    .filter((match): match is TvMatchResult => match !== undefined)
    .sort((left, right) => right.score - left.score);
}

function matchRule(item: NormalizedFeedItem, rule: TvRule): boolean {
  const pattern = new RegExp(rule.pattern, 'i');

  if (!pattern.test(item.normalizedTitle)) {
    return false;
  }

  return (
    rule.resolutions.includes(item.resolution ?? '') &&
    rule.codecs.includes(item.codec ?? '')
  );
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
