/**
 * Loosely inspired by the token-cover + Dice-coefficient heuristic
 * src/plex/shows.ts uses to match a Plex library title against a tracked
 * show — but deliberately stricter, and not shared code. Plex's version is a
 * cosmetic best-guess for display enrichment; a false positive there is a
 * mislabeled poster. A false positive here persists a manual_grabs row under
 * the wrong show — a real, sticky mistake (see grill-me). Both directions of
 * word coverage are required (not just needle-in-haystack), and the Dice
 * fallback additionally requires comparable string lengths — together this
 * means a one-word qualifier difference (e.g. "Show Name" vs "Show Name UK")
 * does NOT match here, even though it would for Plex's cosmetic matcher.
 * That's an intentional, accepted trade: a legitimate regional-variant
 * release the reconciler misses can still be grabbed by hand via the
 * existing "Find on EZTV" flow, which costs nothing; a wrongly-adopted
 * episode silently corrupts another show's episode list, which costs a
 * manual cleanup the operator won't know to look for.
 */
const TITLE_MATCH_THRESHOLD = 0.72;
/** Below this length ratio (shorter / longer), the Dice fallback is not
 * trusted even at a high raw score — a short string that's a near-total
 * substring of a longer one (e.g. "the office" inside "the office us")
 * scores deceptively high on bigram overlap alone. */
const MIN_LENGTH_RATIO_FOR_DICE = 0.85;

export function titlesMatch(normalizedA: string, normalizedB: string): boolean {
  return titleMatchScore(normalizedA, normalizedB) >= TITLE_MATCH_THRESHOLD;
}

function titleMatchScore(rawA: string, rawB: string): number {
  const a = normalizeForMatch(rawA);
  const b = normalizeForMatch(rawB);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const comparableLengths =
    Math.min(a.length, b.length) / Math.max(a.length, b.length) >=
    MIN_LENGTH_RATIO_FOR_DICE;

  return Math.max(
    symmetricTokenCoverScore(a, b),
    a.length >= 2 && b.length >= 2 && comparableLengths
      ? diceCoefficient(a, b)
      : 0,
  );
}

/** True only when every word of `a` appears in `b` AND every word of `b`
 * appears in `a` — i.e. the same set of words, any order. One-directional
 * coverage (needle fully contained in haystack) is exactly the shape of
 * false positive this function exists to reject — see the module doc. */
function symmetricTokenCoverScore(a: string, b: string): number {
  return coversAllWords(a, b) && coversAllWords(b, a) ? 0.94 : 0;
}

function coversAllWords(needle: string, haystack: string): boolean {
  const words = needle.split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return false;
  const padded = ` ${haystack} `;
  return words.every((w) => padded.includes(` ${w} `));
}

function normalizeForMatch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function diceCoefficient(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;

  const leftPairs = pairCounts(left);
  const rightPairs = pairCounts(right);
  let overlap = 0;

  for (const [pair, leftCount] of leftPairs) {
    const rightCount = rightPairs.get(pair) ?? 0;
    overlap += Math.min(leftCount, rightCount);
  }

  return (2 * overlap) / (left.length - 1 + (right.length - 1));
}

function pairCounts(input: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let index = 0; index < input.length - 1; index += 1) {
    const pair = input.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}
