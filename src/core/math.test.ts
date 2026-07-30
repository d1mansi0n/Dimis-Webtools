import { describe, expect, it } from 'vitest';
import { clamp, parseDecimal, roundToStep } from './math.js';

describe('clamp', () => {
  it('constrains to the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('collapses non-finite input to the minimum instead of propagating NaN', () => {
    expect(clamp(NaN, 1, 10)).toBe(1);
    expect(clamp(Infinity, 1, 10)).toBe(1);
  });
});

describe('roundToStep', () => {
  it('snaps to the nearest multiple', () => {
    expect(roundToStep(1.2, 0.5)).toBe(1);
    expect(roundToStep(1.3, 0.5)).toBe(1.5);
    expect(roundToStep(7, 1)).toBe(7);
  });
});

describe('parseDecimal', () => {
  it('accepts both decimal separators', () => {
    expect(parseDecimal('1.5')).toBe(1.5);
    expect(parseDecimal('1,5')).toBe(1.5);
  });

  it('ignores surrounding whitespace', () => {
    expect(parseDecimal('  2 ')).toBe(2);
  });

  it.each(['', '   ', 'abc', '1.2.3'])('rejects %j', (value) => {
    expect(parseDecimal(value)).toBeUndefined();
  });
});
