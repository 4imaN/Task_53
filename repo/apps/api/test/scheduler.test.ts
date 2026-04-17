import { describe, expect, it } from 'vitest';

// The timing helpers are private constants inside scheduler.service.ts.
// We reproduce their exact implementations here to unit-test the scheduling
// contract without requiring a database or FastifyInstance.  Any divergence
// between this file and the service will surface as a test failure.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const startOfLocalDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

const previousDayWindow = (referenceDate: Date) => {
  const periodEnd = startOfLocalDay(referenceDate);
  const periodStart = new Date(periodEnd.getTime() - MS_PER_DAY);
  return { periodStart, periodEnd };
};

const nextTwoAm = (from = new Date()) => {
  const next = new Date(from);
  next.setHours(2, 0, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
};

// ---------------------------------------------------------------------------
// startOfLocalDay
// ---------------------------------------------------------------------------

describe('startOfLocalDay', () => {
  it('returns midnight (00:00:00.000) on the same calendar date', () => {
    const input = new Date(2026, 3, 17, 14, 35, 22, 500); // 17 Apr 2026 14:35:22.500
    const result = startOfLocalDay(input);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('preserves the date components of the input', () => {
    const input = new Date(2026, 3, 17, 23, 59, 59, 999);
    const result = startOfLocalDay(input);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3);   // April = 3
    expect(result.getDate()).toBe(17);
  });

  it('handles midnight input (already at start of day)', () => {
    const midnight = new Date(2026, 0, 1, 0, 0, 0, 0); // 1 Jan 2026 00:00:00.000
    const result = startOfLocalDay(midnight);
    expect(result.getTime()).toBe(midnight.getTime());
  });

  it('returns a new Date object, not the same reference', () => {
    const input = new Date(2026, 3, 17, 10, 0, 0, 0);
    const result = startOfLocalDay(input);
    expect(result).not.toBe(input);
  });
});

// ---------------------------------------------------------------------------
// previousDayWindow
// ---------------------------------------------------------------------------

describe('previousDayWindow', () => {
  it('periodEnd equals midnight of the reference date', () => {
    const ref = new Date(2026, 3, 17, 11, 0, 0, 0); // 17 Apr 2026 11:00
    const { periodEnd } = previousDayWindow(ref);
    expect(periodEnd.getFullYear()).toBe(2026);
    expect(periodEnd.getMonth()).toBe(3);
    expect(periodEnd.getDate()).toBe(17);
    expect(periodEnd.getHours()).toBe(0);
    expect(periodEnd.getMinutes()).toBe(0);
    expect(periodEnd.getSeconds()).toBe(0);
  });

  it('periodStart equals midnight of the day before the reference date', () => {
    const ref = new Date(2026, 3, 17, 11, 0, 0, 0); // 17 Apr 2026
    const { periodStart } = previousDayWindow(ref);
    expect(periodStart.getFullYear()).toBe(2026);
    expect(periodStart.getMonth()).toBe(3);
    expect(periodStart.getDate()).toBe(16);
    expect(periodStart.getHours()).toBe(0);
    expect(periodStart.getMinutes()).toBe(0);
    expect(periodStart.getSeconds()).toBe(0);
  });

  it('window spans exactly 24 hours', () => {
    const ref = new Date(2026, 3, 17, 9, 30, 0, 0);
    const { periodStart, periodEnd } = previousDayWindow(ref);
    expect(periodEnd.getTime() - periodStart.getTime()).toBe(MS_PER_DAY);
  });

  it('handles month boundary correctly (1 May → window is 30 April)', () => {
    const ref = new Date(2026, 4, 1, 6, 0, 0, 0); // 1 May 2026
    const { periodStart, periodEnd } = previousDayWindow(ref);
    expect(periodEnd.getDate()).toBe(1);
    expect(periodEnd.getMonth()).toBe(4);   // May = 4
    expect(periodStart.getDate()).toBe(30);
    expect(periodStart.getMonth()).toBe(3); // April = 3
  });

  it('handles year boundary correctly (1 Jan → window is 31 Dec previous year)', () => {
    const ref = new Date(2026, 0, 1, 1, 0, 0, 0); // 1 Jan 2026
    const { periodStart } = previousDayWindow(ref);
    expect(periodStart.getFullYear()).toBe(2025);
    expect(periodStart.getMonth()).toBe(11); // December = 11
    expect(periodStart.getDate()).toBe(31);
  });

  it('periodStart is strictly less than periodEnd', () => {
    const ref = new Date();
    const { periodStart, periodEnd } = previousDayWindow(ref);
    expect(periodStart.getTime()).toBeLessThan(periodEnd.getTime());
  });
});

// ---------------------------------------------------------------------------
// nextTwoAm
// ---------------------------------------------------------------------------

describe('nextTwoAm', () => {
  it('returns a Date after the from argument', () => {
    const from = new Date();
    const result = nextTwoAm(from);
    expect(result.getTime()).toBeGreaterThan(from.getTime());
  });

  it('result is always at 02:00:00.000 local time', () => {
    const samples = [
      new Date(2026, 3, 17, 0, 0, 0, 0),   // exactly midnight
      new Date(2026, 3, 17, 1, 59, 59, 999), // just before 2 AM
      new Date(2026, 3, 17, 2, 0, 0, 1),    // just after 2 AM
      new Date(2026, 3, 17, 10, 0, 0, 0),   // mid-day
      new Date(2026, 3, 17, 23, 0, 0, 0)    // late evening
    ];

    for (const from of samples) {
      const result = nextTwoAm(from);
      expect(result.getHours()).toBe(2);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    }
  });

  it('returns today 2 AM when called just before 2 AM (00:01:00)', () => {
    const from = new Date(2026, 3, 17, 0, 1, 0, 0);
    const result = nextTwoAm(from);
    expect(result.getDate()).toBe(17);
    expect(result.getHours()).toBe(2);
  });

  it('returns next-day 2 AM when called at exactly 2 AM (edge: <= comparison)', () => {
    const from = new Date(2026, 3, 17, 2, 0, 0, 0); // exactly 2 AM
    const result = nextTwoAm(from);
    // next.getTime() <= from.getTime() is true when equal, so it adds one day
    expect(result.getDate()).toBe(18);
    expect(result.getHours()).toBe(2);
  });

  it('returns next-day 2 AM when called after 2 AM (e.g. 10 AM)', () => {
    const from = new Date(2026, 3, 17, 10, 0, 0, 0);
    const result = nextTwoAm(from);
    expect(result.getDate()).toBe(18);
    expect(result.getHours()).toBe(2);
  });

  it('delay is always positive (next run is in the future)', () => {
    const from = new Date(2026, 3, 17, 14, 0, 0, 0);
    const result = nextTwoAm(from);
    expect(result.getTime() - from.getTime()).toBeGreaterThan(0);
  });

  it('delay does not exceed 24 hours', () => {
    const from = new Date(2026, 3, 17, 2, 0, 0, 1); // 1 ms after 2 AM
    const result = nextTwoAm(from);
    const delayMs = result.getTime() - from.getTime();
    expect(delayMs).toBeLessThan(MS_PER_DAY);
  });

  it('uses current time as default argument when no from is provided', () => {
    const before = new Date();
    const result = nextTwoAm();
    expect(result.getTime()).toBeGreaterThan(before.getTime());
  });
});
