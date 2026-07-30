import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatIsoDate,
  formatNumber,
  formatStopwatch,
  formatTimeOfDay,
  legacyDateToIso,
  parseIsoDate,
  toDecimalHours,
  toIsoDate,
} from './format.js';

describe('formatDuration', () => {
  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(1_000)).toBe('00:00:01');
    expect(formatDuration(61_000)).toBe('00:01:01');
    expect(formatDuration(3_661_000)).toBe('01:01:01');
  });

  it('does not wrap at 24 hours, because this is a duration', () => {
    expect(formatDuration(30 * 3_600_000)).toBe('30:00:00');
  });

  it('treats negative and non-finite input as zero', () => {
    expect(formatDuration(-5)).toBe('00:00:00');
    expect(formatDuration(NaN)).toBe('00:00:00');
    expect(formatDuration(Infinity)).toBe('00:00:00');
  });
});

describe('toDecimalHours', () => {
  it('converts milliseconds to hours with two decimals', () => {
    expect(toDecimalHours(3_600_000)).toBe(1);
    expect(toDecimalHours(1_800_000)).toBe(0.5);
    expect(toDecimalHours(2_700_000)).toBe(0.75);
  });

  it('rounds rather than truncating', () => {
    expect(toDecimalHours(1_000)).toBe(0);
    expect(toDecimalHours(20_000)).toBe(0.01);
  });

  it('returns a number, so spreadsheets can sum it', () => {
    expect(typeof toDecimalHours(3_600_000)).toBe('number');
  });
});

describe('formatStopwatch', () => {
  it('formats whole seconds as MM:SS', () => {
    expect(formatStopwatch(0)).toBe('00:00');
    expect(formatStopwatch(59)).toBe('00:59');
    expect(formatStopwatch(600)).toBe('10:00');
  });

  it('lets minutes exceed 59', () => {
    expect(formatStopwatch(3_600)).toBe('60:00');
  });
});

describe('formatTimeOfDay', () => {
  it('formats a local wall-clock time', () => {
    expect(formatTimeOfDay(new Date(2026, 6, 29, 9, 5, 3))).toBe('09:05:03');
  });

  it('degrades to zeroes for an invalid date', () => {
    expect(formatTimeOfDay(new Date(NaN))).toBe('00:00:00');
  });
});

describe('ISO dates', () => {
  it('uses local components, not UTC', () => {
    /* 23:30 local on the 29th must stay the 29th, whatever the time zone. */
    expect(toIsoDate(new Date(2026, 6, 29, 23, 30))).toBe('2026-07-29');
  });

  it('pads month and day', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('parses a well-formed date', () => {
    expect(parseIsoDate('2026-07-29')?.getFullYear()).toBe(2026);
  });

  it.each(['2026-7-29', '29.07.2026', '2026-13-01', '2026-02-31', ''])('rejects %s', (value) => {
    expect(parseIsoDate(value)).toBeUndefined();
  });

  it('formats for a locale', () => {
    expect(formatIsoDate('2026-07-29', 'de-DE')).toBe('29.07.2026');
    expect(formatIsoDate('2026-07-29', 'en-GB')).toBe('29/07/2026');
  });

  it('passes through a value it cannot parse rather than showing "Invalid Date"', () => {
    expect(formatIsoDate('whenever', 'de-DE')).toBe('whenever');
  });
});

describe('legacyDateToIso', () => {
  it('converts the DD.MM.YY strings written by the 1.0 tracker', () => {
    expect(legacyDateToIso('29.07.26')).toBe('2026-07-29');
    expect(legacyDateToIso('01.01.25')).toBe('2025-01-01');
  });

  it.each(['2026-07-29', '29.7.26', '32.01.26', 'nonsense'])('rejects %s', (value) => {
    expect(legacyDateToIso(value)).toBeUndefined();
  });
});

describe('formatNumber', () => {
  it('uses locale separators', () => {
    expect(formatNumber(1234.5, 'de-DE')).toBe('1.234,5');
    expect(formatNumber(1234.5, 'en-US')).toBe('1,234.5');
  });

  it('honours the fraction-digit limit', () => {
    expect(formatNumber(1.239, 'en-US', 2)).toBe('1.24');
  });
});
