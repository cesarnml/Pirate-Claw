import { describe, expect, it } from 'bun:test';

import {
  classifyEventLoopLag,
  DEFAULT_EVENT_LOOP_LAG_SEVERE_THRESHOLD_MS,
  DEFAULT_EVENT_LOOP_LAG_WARN_THRESHOLD_MS,
  formatEventLoopLagLine,
  startEventLoopLagProbe,
} from '../src/event-loop-lag';

describe('classifyEventLoopLag', () => {
  it('is ok below the warn threshold', () => {
    expect(classifyEventLoopLag(0)).toBe('ok');
    expect(
      classifyEventLoopLag(DEFAULT_EVENT_LOOP_LAG_WARN_THRESHOLD_MS - 1),
    ).toBe('ok');
  });

  it('is warn at and above the warn threshold, below severe', () => {
    expect(classifyEventLoopLag(DEFAULT_EVENT_LOOP_LAG_WARN_THRESHOLD_MS)).toBe(
      'warn',
    );
    expect(
      classifyEventLoopLag(DEFAULT_EVENT_LOOP_LAG_SEVERE_THRESHOLD_MS - 1),
    ).toBe('warn');
  });

  it('is severe at and above the severe threshold', () => {
    expect(
      classifyEventLoopLag(DEFAULT_EVENT_LOOP_LAG_SEVERE_THRESHOLD_MS),
    ).toBe('severe');
    expect(classifyEventLoopLag(45_000)).toBe('severe');
  });

  it('honors custom thresholds instead of the defaults', () => {
    expect(classifyEventLoopLag(100, { warnMs: 50, severeMs: 200 })).toBe(
      'warn',
    );
    expect(classifyEventLoopLag(300, { warnMs: 50, severeMs: 200 })).toBe(
      'severe',
    );
  });
});

describe('formatEventLoopLagLine', () => {
  it('marks a severe lag distinctly from a warn-level one in the same line shape', () => {
    const expectedAt = new Date('2026-09-05T16:06:03.760Z');
    const firedAt = new Date('2026-09-05T16:06:26.240Z');

    const severeLine = formatEventLoopLagLine({
      lagMs: 22_480,
      expectedAt,
      firedAt,
      level: 'severe',
    });
    expect(severeLine).toContain('SEVERE');
    expect(severeLine).toContain('22480ms');
    expect(severeLine).toContain('2026-09-05T16:06:03.760Z');
    expect(severeLine).toContain('2026-09-05T16:06:26.240Z');

    const warnLine = formatEventLoopLagLine({
      lagMs: 300,
      expectedAt,
      firedAt,
      level: 'warn',
    });
    expect(warnLine).not.toContain('SEVERE');
    expect(warnLine).toContain('300ms');
  });
});

/** A controllable fake clock + scheduler so the probe's recursive-timer logic
 * can be exercised deterministically, with no real waiting. */
function createFakeScheduler() {
  let nowMs = 0;
  let pending: { fn: () => void; dueAtMs: number } | null = null;

  return {
    now: () => nowMs,
    schedule: (fn: () => void, ms: number) => {
      pending = { fn, dueAtMs: nowMs + ms };
      return pending;
    },
    clearScheduled: (handle: unknown) => {
      if (handle === pending) pending = null;
    },
    /** Advances the fake clock and fires the pending tick if it's now due. */
    advance: (ms: number) => {
      nowMs += ms;
      const due = pending;
      if (due && due.dueAtMs <= nowMs) {
        due.fn();
      }
    },
    hasPending: () => pending !== null,
  };
}

describe('startEventLoopLagProbe', () => {
  it('logs nothing while ticks fire on schedule', () => {
    const clock = createFakeScheduler();
    const lines: string[] = [];
    const probe = startEventLoopLagProbe({
      checkMs: 500,
      log: (message) => lines.push(message),
      now: clock.now,
      schedule: clock.schedule,
      clearScheduled: clock.clearScheduled,
    });

    clock.advance(500);
    clock.advance(500);
    clock.advance(500);

    expect(lines).toEqual([]);
    probe.stop();
  });

  it('logs a warn-level line when a tick fires late past the warn threshold', () => {
    const clock = createFakeScheduler();
    const lines: string[] = [];
    const probe = startEventLoopLagProbe({
      checkMs: 500,
      warnThresholdMs: 250,
      severeThresholdMs: 2000,
      log: (message) => lines.push(message),
      now: clock.now,
      schedule: clock.schedule,
      clearScheduled: clock.clearScheduled,
    });

    // Tick was due at t=500 but the "thread" was blocked until t=900 — 400ms
    // late, past the 250ms warn threshold and under the 2000ms severe one.
    clock.advance(900);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[event-loop] lag');
    expect(lines[0]).not.toContain('SEVERE');
    expect(lines[0]).toContain('400ms');
    probe.stop();
  });

  it('logs a severe line for a multi-second stall, matching what was observed live', () => {
    const clock = createFakeScheduler();
    const lines: string[] = [];
    const probe = startEventLoopLagProbe({
      checkMs: 500,
      log: (message) => lines.push(message),
      now: clock.now,
      schedule: clock.schedule,
      clearScheduled: clock.clearScheduled,
    });

    // Due at t=500, actually runs at t=23000 — a 22.5s stall, the shape
    // observed in the daemon's own logs on 2026-09-05.
    clock.advance(23_000);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('SEVERE');
    expect(lines[0]).toContain('22500ms');
    probe.stop();
  });

  it('rounds a fractional-millisecond lag to a whole number before logging', () => {
    // performance.now() (the real default clock) has sub-millisecond
    // precision; a raw fractional value in the log line is noise nobody
    // reading it at a glance needs. Observed live: an unrounded first draft
    // logged "14164.374036000001ms".
    const clock = createFakeScheduler();
    const lines: string[] = [];
    const probe = startEventLoopLagProbe({
      checkMs: 500,
      log: (message) => lines.push(message),
      // A constant sub-ms offset on a monotonic clock cancels out of any
      // duration measurement; the only way a fraction could still reach the
      // log line is if lagMs itself weren't rounded before formatting.
      now: () => clock.now() + 0.374036,
      schedule: clock.schedule,
      clearScheduled: clock.clearScheduled,
    });

    clock.advance(5_000);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('lag 4500ms');
    expect(lines[0]).not.toContain('4500.');
    probe.stop();
  });

  it('reports one honest gap rather than a burst of catch-up ticks after a stall', () => {
    const clock = createFakeScheduler();
    const lines: string[] = [];
    const probe = startEventLoopLagProbe({
      checkMs: 500,
      log: (message) => lines.push(message),
      now: clock.now,
      schedule: clock.schedule,
      clearScheduled: clock.clearScheduled,
    });

    clock.advance(5_000); // one big jump, not five separate 500ms advances
    expect(lines).toHaveLength(1);

    // The next tick is rescheduled relative to when this one actually fired,
    // not relative to the original schedule, so a healthy follow-up tick
    // logs nothing rather than reporting stale accumulated drift.
    clock.advance(500);
    expect(lines).toHaveLength(1);

    probe.stop();
  });

  it('stops scheduling further ticks once stopped', () => {
    const clock = createFakeScheduler();
    const lines: string[] = [];
    const probe = startEventLoopLagProbe({
      checkMs: 500,
      log: (message) => lines.push(message),
      now: clock.now,
      schedule: clock.schedule,
      clearScheduled: clock.clearScheduled,
    });

    expect(clock.hasPending()).toBe(true);
    probe.stop();
    expect(clock.hasPending()).toBe(false);

    // Even if something external fired the (cleared) handle late, a stopped
    // probe must not log or reschedule.
    clock.advance(10_000);
    expect(lines).toEqual([]);
  });

  it('measures lag from a clock a wall-clock jump cannot fabricate or hide', () => {
    // A forward wall-clock step (NTP correction, manual change) while the
    // loop is otherwise idle must not read as a stall — only the monotonic
    // clock drives the lag math.
    const clock = createFakeScheduler();
    let wallClockMs = 1_000_000;
    const lines: string[] = [];
    const probe = startEventLoopLagProbe({
      checkMs: 500,
      log: (message) => lines.push(message),
      now: clock.now,
      wallClockNow: () => wallClockMs,
      schedule: clock.schedule,
      clearScheduled: clock.clearScheduled,
    });

    wallClockMs += 10_000; // wall clock jumps forward 10s...
    clock.advance(500); // ...but the loop was never actually blocked.

    expect(lines).toEqual([]);
    probe.stop();
  });

  it('reports a real stall even if the wall clock steps backward during it', () => {
    // A backward wall-clock step during a genuine stall must not clamp the
    // reported lag toward zero and mask the incident.
    const clock = createFakeScheduler();
    let wallClockMs = 1_000_000;
    const lines: string[] = [];
    const probe = startEventLoopLagProbe({
      checkMs: 500,
      log: (message) => lines.push(message),
      now: clock.now,
      wallClockNow: () => wallClockMs,
      schedule: clock.schedule,
      clearScheduled: clock.clearScheduled,
    });

    wallClockMs -= 10_000; // wall clock steps backward...
    clock.advance(5_000); // ...while the loop is genuinely blocked 5s.

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('SEVERE');
    expect(lines[0]).toContain('4500ms');
    probe.stop();
  });

  it("uses console.log by default, matching runDaemonLoop's own default logger", () => {
    const clock = createFakeScheduler();
    const originalLog = console.log;
    const calls: unknown[][] = [];
    console.log = (...args: unknown[]) => calls.push(args);
    try {
      const probe = startEventLoopLagProbe({
        checkMs: 500,
        now: clock.now,
        schedule: clock.schedule,
        clearScheduled: clock.clearScheduled,
      });
      clock.advance(3_000);
      probe.stop();
    } finally {
      console.log = originalLog;
    }
    expect(calls.length).toBeGreaterThan(0);
    expect(String(calls[0]?.[0])).toContain('[event-loop]');
  });
});
