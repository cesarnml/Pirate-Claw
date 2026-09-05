/**
 * Detects the daemon's single JS thread going completely unresponsive — not
 * "the daemon is busy," but "nothing ran at all for N milliseconds," including
 * the cheapest possible request.
 *
 * Why this exists (dashboard-load-path review, roadmap item 18). Cycle-level
 * logging (src/daemon.ts's "X cycle completed") only bounds a cycle's total
 * wall time, which mixes two very different things: time spent *awaiting*
 * something (the RSS fetch, a Transmission RPC — the event loop is free and
 * requests are served normally) and time spent *blocked* on synchronous work
 * (a bun:sqlite write, a sync fs call — nothing else runs at all, including
 * /api/health, a pure in-memory read with zero I/O). A cycle's duration can't
 * tell those apart, and in the trace that motivated this, the stall didn't
 * even fall inside a named cycle's start/end window — one 2026-09-05 incident
 * had the daemon silent for 35 seconds *after* "reconcile cycle completed"
 * had already logged. Enumerating suspects (every SQLite call, every sync fs
 * call) and timing each one individually would only catch the ones enumerated
 * in advance. This instead watches the one thing that's true regardless of
 * cause: a timer scheduled every `checkMs` that doesn't fire on time means the
 * thread was busy with something else for exactly that long.
 *
 * Considered node:perf_hooks's `monitorEventLoopDelay` instead of this
 * hand-rolled timer (raised in code review) — it's the built-in, battle-tested
 * primitive for exactly this. Not used here because it reports aggregate
 * histogram statistics (min/max/percentiles) collected over a window you read
 * and reset yourself, which still needs its own polling timer to read from,
 * and loses the one thing this review's incidents actually needed: one line
 * per stall with the wall-clock window it happened in, so it can be
 * correlated against a specific cycle or request. If aggregate percentile
 * reporting becomes useful later (e.g. a "p99 loop delay over the last hour"
 * metric), it's worth adding *alongside* this, not instead of it.
 */

export type EventLoopLagLevel = 'ok' | 'warn' | 'severe';

/** How often the probe checks in. Cheap — one timer, most ticks log nothing. */
export const DEFAULT_EVENT_LOOP_LAG_CHECK_MS = 500;

/**
 * Below this, treat it as ordinary scheduling jitter under load, not a stall
 * worth a log line — a probe that logs on every few-millisecond wobble is
 * noise nobody will read past.
 */
export const DEFAULT_EVENT_LOOP_LAG_WARN_THRESHOLD_MS = 250;

/**
 * Above this, it's the multi-second-freeze shape this review has actually
 * observed (20-45s stalls) rather than a brief hiccup — escalated so it reads
 * differently in the logs and isn't lost among warn-level lines.
 */
export const DEFAULT_EVENT_LOOP_LAG_SEVERE_THRESHOLD_MS = 2000;

export function classifyEventLoopLag(
  lagMs: number,
  thresholds: { warnMs: number; severeMs: number } = {
    warnMs: DEFAULT_EVENT_LOOP_LAG_WARN_THRESHOLD_MS,
    severeMs: DEFAULT_EVENT_LOOP_LAG_SEVERE_THRESHOLD_MS,
  },
): EventLoopLagLevel {
  if (lagMs >= thresholds.severeMs) return 'severe';
  if (lagMs >= thresholds.warnMs) return 'warn';
  return 'ok';
}

/**
 * One grep-able line. `SEVERE` is a literal marker in the text (not a log
 * level) so it stays visible under `grep event-loop` alongside warn-level
 * lines, in whatever log-shipping setup ends up reading this daemon's stdout.
 */
export function formatEventLoopLagLine(input: {
  lagMs: number;
  expectedAt: Date;
  firedAt: Date;
  level: Extract<EventLoopLagLevel, 'warn' | 'severe'>;
}): string {
  const tag =
    input.level === 'severe' ? '[event-loop] SEVERE lag' : '[event-loop] lag';
  return (
    `${tag} ${String(input.lagMs)}ms — probe expected to run at ` +
    `${input.expectedAt.toISOString()}, actually ran at ` +
    `${input.firedAt.toISOString()}. Nothing else — not even a plain ` +
    `in-memory read — could run on this thread during that window.`
  );
}

export function startEventLoopLagProbe(input: {
  checkMs?: number;
  warnThresholdMs?: number;
  severeThresholdMs?: number;
  log?: (message: string) => void;
  /** Monotonic clock the lag itself is measured against — injectable for
   * deterministic tests; defaults to `performance.now()`, deliberately not
   * `Date.now()` (see the comment below `now` for why). */
  now?: () => number;
  /** Wall clock used only to render the "expected at" / "actually ran at"
   * timestamps a human reads in the log line — never used in the lag math,
   * so an NTP correction here can make a log line's timestamps look odd but
   * can't fabricate or hide an incident. Injectable for deterministic tests;
   * defaults to `Date.now()`. */
  wallClockNow?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  clearScheduled?: (handle: unknown) => void;
}): { stop: () => void } {
  const checkMs = input.checkMs ?? DEFAULT_EVENT_LOOP_LAG_CHECK_MS;
  const thresholds = {
    warnMs: input.warnThresholdMs ?? DEFAULT_EVENT_LOOP_LAG_WARN_THRESHOLD_MS,
    severeMs:
      input.severeThresholdMs ?? DEFAULT_EVENT_LOOP_LAG_SEVERE_THRESHOLD_MS,
  };
  const log = input.log ?? console.log;
  // performance.now(), not Date.now(): Date.now() is a wall clock, not
  // guaranteed monotonic — an NTP step or a manual clock change while the
  // loop is otherwise idle would show up as a fabricated multi-second "lag"
  // (a forward step) or silently mask a real stall that coincided with it (a
  // backward step, clamped to 0 below). performance.now() only ever moves
  // forward at a steady rate regardless of wall-clock adjustments, which is
  // what a *duration* measurement needs. (Caught in code review, 2026-09-05,
  // before this shipped.)
  const now = input.now ?? (() => performance.now());
  const wallClockNow = input.wallClockNow ?? (() => Date.now());
  const schedule =
    input.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearScheduled =
    input.clearScheduled ??
    ((handle: unknown) =>
      clearTimeout(handle as Parameters<typeof clearTimeout>[0]));

  // Recursive setTimeout, not setInterval: after a real stall, setInterval
  // can fire its queued tick(s) back-to-back once the loop frees up, which
  // would report the same stall as several small lags instead of one honest
  // big one. Rescheduling only after each tick finishes reports it as what it
  // was — a single gap between the expected time and when this thread was
  // finally free to notice.
  let stopped = false;
  let expectedAtMs = now() + checkMs;
  let timerHandle: unknown;

  function tick(): void {
    if (stopped) return;
    const firedAtMs = now();
    // Rounded once, here — performance.now() (the real default clock) has
    // sub-millisecond precision, and that precision is noise for a value
    // whose whole point is being read at a glance in a log line.
    const lagMs = Math.round(Math.max(0, firedAtMs - expectedAtMs));
    const level = classifyEventLoopLag(lagMs, thresholds);
    if (level !== 'ok') {
      // Wall-clock timestamps for the log line are derived from the
      // measured lag, not from separate now()/wallClockNow() reads at two
      // different instants — that would reintroduce exactly the
      // clock-jump problem the monotonic clock above exists to avoid.
      const firedAtWall = wallClockNow();
      log(
        formatEventLoopLagLine({
          lagMs,
          expectedAt: new Date(firedAtWall - lagMs),
          firedAt: new Date(firedAtWall),
          level,
        }),
      );
    }
    expectedAtMs = firedAtMs + checkMs;
    timerHandle = schedule(tick, checkMs);
  }

  timerHandle = schedule(tick, checkMs);

  return {
    stop: () => {
      stopped = true;
      clearScheduled(timerHandle);
    },
  };
}
