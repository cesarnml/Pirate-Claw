import type { RawFeedItem } from './feed';

/**
 * Feed-window coverage telemetry: how much of what a feed just handed us we
 * had already recorded, and how far back its window still reaches compared to
 * how long it has actually been since we last looked.
 *
 * Why this exists. An RSS feed is a fixed-size window over a moving stream —
 * EZTV returns exactly 30 items, whichever 30 are newest. A late or skipped
 * poll costs nothing by itself: feed items are deduped on `guid_or_link`, so
 * the next poll re-reads whatever is currently in the window and catches up on
 * anything still there. The one way an item is lost outright is the window
 * rotating completely past us between two polls, and that condition is
 * directly checkable rather than something to worry about in the abstract —
 * it's `windowRotatedPastUs` below, and it is the only field here worth an
 * alarm.
 *
 * Measured against the live database 2026-09-05, this is not currently close:
 * EZTV's 30-item window reached back 122-320 minutes against a nominal
 * 15-minute cadence, and YIFY's reached back 644-839 minutes — roughly 8x and
 * 44x margin respectively, with no observed poll where the window failed to
 * reach past the previous one. What erodes that margin is not the configured
 * interval but polls arriving late: reconcile and the feed poller share one
 * lock (see runDaemonLoop's `busy` flag), so a long reconcile defers the feed
 * run behind it, observed pushing a nominal 15-minute cadence out to 65
 * minutes. `sinceLastPollMinutes` is what makes that drift visible, and it is
 * the reason this logs the *actual* gap rather than the configured interval.
 */
export type FeedWindowStats = {
  feedName: string;
  /** Distinct `guidOrLink` values in this poll's response. */
  windowSize: number;
  /** Of those, how many had never been recorded in an earlier run. */
  newCount: number;
  /** `windowSize - newCount`. */
  seenBeforeCount: number;
  /** 0-100, rounded. `null` when the response was empty. */
  overlapPercent: number | null;
  /**
   * Minutes from the oldest item still in the window to now — i.e. how far
   * back the feed can currently cover for us. `null` when the response was
   * empty or carried no parseable publish date.
   */
  reachBackMinutes: number | null;
  /** Minutes since this feed's previous poll. `null` on the first ever poll. */
  sinceLastPollMinutes: number | null;
  /**
   * `reachBackMinutes / sinceLastPollMinutes` — how many times over the window
   * covers the gap it needs to. `null` when either input is unknown, or when
   * the gap rounds to zero minutes (two polls inside the same minute, which
   * makes the ratio meaningless rather than infinite).
   */
  marginRatio: number | null;
  /**
   * The window's oldest item is newer than our previous poll, so there is a
   * span of time this feed no longer covers and we never read. Anything
   * published in that span is gone as far as this app is concerned. This is
   * the only genuine data-loss condition for a feed poller, and it has never
   * fired against the live data.
   */
  windowRotatedPastUs: boolean;
  /** Oldest publish timestamp in the window, for the alarm line's detail. */
  oldestPublishedAt: string | null;
  /** Echoed back so the alarm line can name both sides of the gap. */
  previousPollAt: string | null;
};

function parseTimestamp(value: string | undefined | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Durations are clamped at zero. A negative one only ever means clock skew
 * between us and the feed's publisher (or a `pubDate` slightly in the future),
 * which is never something the operator can act on — reporting it as a
 * negative age would just look like a bug in this code.
 */
function minutesBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.round((toMs - fromMs) / 60_000));
}

export function summarizeFeedWindow(input: {
  feedName: string;
  items: RawFeedItem[];
  /** `guidOrLink` values already recorded by an earlier run of this feed. */
  knownGuids: ReadonlySet<string>;
  /** ISO timestamp of this feed's previous poll; omit on the first ever poll. */
  previousPollAt?: string;
  now?: Date;
}): FeedWindowStats {
  const nowMs = (input.now ?? new Date()).getTime();

  const distinctGuids = new Set(input.items.map((item) => item.guidOrLink));
  const windowSize = distinctGuids.size;
  let newCount = 0;
  for (const guid of distinctGuids) {
    if (!input.knownGuids.has(guid)) newCount += 1;
  }
  const seenBeforeCount = windowSize - newCount;

  let oldestMs: number | null = null;
  let oldestPublishedAt: string | null = null;
  for (const item of input.items) {
    const publishedMs = parseTimestamp(item.publishedAt);
    if (publishedMs === null) continue;
    if (oldestMs === null || publishedMs < oldestMs) {
      oldestMs = publishedMs;
      oldestPublishedAt = item.publishedAt;
    }
  }

  const previousPollMs = parseTimestamp(input.previousPollAt);
  const reachBackMinutes =
    oldestMs === null ? null : minutesBetween(oldestMs, nowMs);
  const sinceLastPollMinutes =
    previousPollMs === null ? null : minutesBetween(previousPollMs, nowMs);

  const marginRatio =
    reachBackMinutes === null ||
    sinceLastPollMinutes === null ||
    sinceLastPollMinutes === 0
      ? null
      : Number((reachBackMinutes / sinceLastPollMinutes).toFixed(1));

  return {
    feedName: input.feedName,
    windowSize,
    newCount,
    seenBeforeCount,
    overlapPercent:
      windowSize === 0
        ? null
        : Math.round((seenBeforeCount / windowSize) * 100),
    reachBackMinutes,
    sinceLastPollMinutes,
    marginRatio,
    windowRotatedPastUs:
      oldestMs !== null && previousPollMs !== null && oldestMs > previousPollMs,
    oldestPublishedAt,
    previousPollAt: input.previousPollAt ?? null,
  };
}

function orNa(value: number | null, suffix = ''): string {
  return value === null ? 'n/a' : `${String(value)}${suffix}`;
}

/** One grep-able line per feed per poll. */
export function formatFeedWindowLine(stats: FeedWindowStats): string {
  return (
    `[feed] ${stats.feedName} window=${String(stats.windowSize)} ` +
    `new=${String(stats.newCount)} ` +
    `overlap=${orNa(stats.overlapPercent, '%')} ` +
    `reach_back=${orNa(stats.reachBackMinutes, 'min')} ` +
    `since_last_poll=${orNa(stats.sinceLastPollMinutes, 'min')} ` +
    `margin=${orNa(stats.marginRatio, 'x')}`
  );
}

/**
 * The alarm. Deliberately wordy and unmistakable: this is the one feed
 * condition that means releases were actually missed, and it should never be
 * mistaken for the routine line above while skimming a log.
 */
export function formatFeedWindowAlarm(stats: FeedWindowStats): string {
  return (
    `[feed] ${stats.feedName} WINDOW ROTATED PAST US — oldest item still in ` +
    `the feed (${stats.oldestPublishedAt ?? 'unknown'}) is newer than our ` +
    `previous poll (${stats.previousPollAt ?? 'unknown'}), so anything ` +
    `published between those two points rotated out before we read it and is ` +
    `lost. Poll this feed more often, or find out why the last poll was ` +
    `${orNa(stats.sinceLastPollMinutes, ' minutes')} ago.`
  );
}
