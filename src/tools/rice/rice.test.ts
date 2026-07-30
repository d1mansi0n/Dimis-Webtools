import { describe, expect, it, vi } from 'vitest';
import {
  convert,
  createRatioStore,
  DEFAULT_RATIO,
  isValidRatio,
  MAX_RATIO,
  MIN_RATIO,
  PRESETS,
} from './rice.js';

describe('convert', () => {
  it('multiplies cups by the ratio', () => {
    expect(convert(2, 1.2)).toEqual({ water: 2.4, total: 4.4 });
  });

  it('reports the combined volume in the pot', () => {
    expect(convert(1, 2).total).toBe(3);
  });

  it('handles zero', () => {
    expect(convert(0, 1.5)).toEqual({ water: 0, total: 0 });
  });
});

describe('isValidRatio', () => {
  it('accepts the whole documented range', () => {
    expect(isValidRatio(MIN_RATIO)).toBe(true);
    expect(isValidRatio(MAX_RATIO)).toBe(true);
    expect(isValidRatio(1.2)).toBe(true);
  });

  it.each([0, -1, MIN_RATIO - 0.01, MAX_RATIO + 0.01, NaN, Infinity])('rejects %s', (value) => {
    expect(isValidRatio(value)).toBe(false);
  });
});

describe('presets', () => {
  it('are all valid ratios', () => {
    for (const preset of PRESETS) {
      expect(isValidRatio(preset.ratio)).toBe(true);
    }
  });

  it('include the default, so the initial state matches a highlighted button', () => {
    expect(PRESETS.map((preset) => preset.ratio)).toContain(DEFAULT_RATIO);
  });
});

describe('ratio persistence', () => {
  it('starts at the default', () => {
    expect(createRatioStore().read()).toBe(DEFAULT_RATIO);
  });

  it('round-trips a chosen ratio', () => {
    const store = createRatioStore();
    store.write(1.75);
    expect(createRatioStore().read()).toBe(1.75);
  });

  it('adopts the ratio saved by the 1.0 and 2.0 tools', () => {
    localStorage.setItem('waterToRiceRatio', '1.5');
    expect(createRatioStore().read()).toBe(1.5);
  });

  it('ignores an out-of-range value written by hand', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem('dwt:rice.ratio', '10000');
    expect(createRatioStore().read()).toBe(DEFAULT_RATIO);
  });

  it('ignores a legacy value that is out of range', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem('waterToRiceRatio', '0');
    expect(createRatioStore().read()).toBe(DEFAULT_RATIO);
  });
});
