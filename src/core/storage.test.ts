import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineStore, isPersistent, resetStorageForTesting } from './storage.js';
import { arrayOf, integer, number, objectOf, string } from './schema.js';

const ratioStore = () => defineStore({ key: 'test.ratio', decoder: number, fallback: () => 1.2 });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reading', () => {
  it('returns the fallback when nothing is stored', () => {
    expect(ratioStore().read()).toBe(1.2);
  });

  it('round-trips a written value', () => {
    const store = ratioStore();
    expect(store.write(1.5).ok).toBe(true);
    expect(store.read()).toBe(1.5);
  });

  it('namespaces its key so it cannot collide with other scripts on the origin', () => {
    const store = ratioStore();
    store.write(2);
    expect(store.key).toBe('dwt:test.ratio');
    expect(localStorage.getItem('dwt:test.ratio')).toBe('2');
    expect(localStorage.getItem('test.ratio')).toBeNull();
  });

  it('builds a fresh fallback each time so callers cannot share mutable state', () => {
    const store = defineStore({
      key: 'test.list',
      decoder: arrayOf(integer),
      fallback: () => [],
    });
    const first = store.read();
    first.push(1);
    expect(store.read()).toEqual([]);
  });
});

describe('corrupt data', () => {
  it('quarantines a value that does not match the schema and falls back', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem('dwt:test.ratio', '"not a number"');

    expect(ratioStore().read()).toBe(1.2);
    expect(localStorage.getItem('dwt:test.ratio')).toBeNull();
    expect(localStorage.getItem('dwt:test.ratio!corrupt')).toBe('"not a number"');
  });

  it('quarantines malformed JSON rather than throwing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem('dwt:test.ratio', '{not json');

    expect(() => ratioStore().read()).not.toThrow();
    expect(localStorage.getItem('dwt:test.ratio!corrupt')).toBe('{not json');
  });

  it('keeps only the most recent corrupt copy, so a bad key cannot grow the quota', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = ratioStore();

    localStorage.setItem('dwt:test.ratio', '"first"');
    store.read();
    localStorage.setItem('dwt:test.ratio', '"second"');
    store.read();

    expect(localStorage.getItem('dwt:test.ratio!corrupt')).toBe('"second"');
    const quarantineKeys = Object.keys(localStorage).filter((key) => key.includes('!corrupt'));
    expect(quarantineKeys).toHaveLength(1);
  });

  it('survives a deeply malformed structure that the old code would have crashed on', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = defineStore({
      key: 'test.board',
      decoder: arrayOf(arrayOf(integer)),
      fallback: () => [],
    });
    localStorage.setItem('dwt:test.board', '[[1,2,3],"not a row"]');

    expect(store.read()).toEqual([]);
  });
});

describe('migration from the 1.0/2.0 keys', () => {
  it('adopts a legacy value and writes it forward under the namespaced key', () => {
    localStorage.setItem('waterToRiceRatio', '1.8');
    const store = defineStore({
      key: 'rice.ratio',
      decoder: number,
      fallback: () => 1.2,
      legacy: { key: 'waterToRiceRatio', decoder: number },
    });

    expect(store.read()).toBe(1.8);
    expect(localStorage.getItem('dwt:rice.ratio')).toBe('1.8');
  });

  it('leaves the legacy key in place so rolling back loses nothing', () => {
    localStorage.setItem('waterToRiceRatio', '1.8');
    defineStore({
      key: 'rice.ratio',
      decoder: number,
      fallback: () => 1.2,
      legacy: { key: 'waterToRiceRatio', decoder: number },
    }).read();

    expect(localStorage.getItem('waterToRiceRatio')).toBe('1.8');
  });

  it('prefers the namespaced value once one exists', () => {
    localStorage.setItem('waterToRiceRatio', '1.8');
    localStorage.setItem('dwt:rice.ratio', '2.5');
    const store = defineStore({
      key: 'rice.ratio',
      decoder: number,
      fallback: () => 1.2,
      legacy: { key: 'waterToRiceRatio', decoder: number },
    });

    expect(store.read()).toBe(2.5);
  });

  it('ignores an unreadable legacy value and uses the fallback', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem('waterToRiceRatio', 'garbage');
    const store = defineStore({
      key: 'rice.ratio',
      decoder: number,
      fallback: () => 1.2,
      legacy: { key: 'waterToRiceRatio', decoder: number },
    });

    expect(store.read()).toBe(1.2);
  });

  it('can reshape the legacy value on the way in', () => {
    localStorage.setItem('legacyEntries', JSON.stringify([{ id: 1, elapsed: 500 }]));
    const store = defineStore({
      key: 'time.entries',
      decoder: arrayOf(objectOf({ id: integer, accumulated: integer })),
      fallback: () => [],
      legacy: {
        key: 'legacyEntries',
        decoder: (input, path) => {
          const old = arrayOf(objectOf({ id: integer, elapsed: integer }))(input, path);
          return old.ok
            ? { ok: true, value: old.value.map((e) => ({ id: e.id, accumulated: e.elapsed })) }
            : old;
        },
      },
    });

    expect(store.read()).toEqual([{ id: 1, accumulated: 500 }]);
  });
});

describe('when localStorage is unavailable', () => {
  it('falls back to an in-memory store instead of throwing', () => {
    resetStorageForTesting();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    const store = ratioStore();
    expect(isPersistent()).toBe(false);
    expect(store.write(3).ok).toBe(true);
    expect(store.read()).toBe(3);
  });
});

describe('when the quota is exhausted', () => {
  it('reports the failure rather than throwing', () => {
    const store = defineStore({ key: 'test.text', decoder: string, fallback: () => '' });
    /* Let the availability probe succeed, then fail the real write. */
    store.read();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    const result = store.write('x');
    expect(result).toEqual({ ok: false, error: { kind: 'quota-exceeded' } });
  });

  it('reports a non-serialisable value as a write failure', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const store = defineStore({
      key: 'test.any',
      decoder: (input) => ({ ok: true, value: input }),
      fallback: () => null,
    });

    const result = store.write(circular);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error.kind).toBe('write-failed');
  });
});

describe('clearing', () => {
  it('removes the stored value and returns to the fallback', () => {
    const store = ratioStore();
    store.write(9);
    store.clear();
    expect(store.read()).toBe(1.2);
  });
});

describe('classifying an unusual failure', () => {
  it('reports a thrown string as the message', () => {
    const store = defineStore({ key: 'test.s', decoder: string, fallback: () => '' });
    store.read();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately not an Error
      throw 'disk on fire';
    });

    const result = store.write('x');
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toEqual({
      kind: 'write-failed',
      message: 'disk on fire',
    });
  });

  it('describes a thrown object without printing "[object Object]"', () => {
    const store = defineStore({ key: 'test.s', decoder: string, fallback: () => '' });
    store.read();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately not an Error
      throw { unexpected: true };
    });

    const result = store.write('x');
    expect(result.ok ? '' : (result.error as { message: string }).message).toBe('unknown error');
  });

  it('recognises the Firefox quota error, which uses a different name and code', () => {
    const store = defineStore({ key: 'test.s', decoder: string, fallback: () => '' });
    store.read();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('full'), {
        name: 'NS_ERROR_DOM_QUOTA_REACHED',
        code: 1014,
      });
    });

    expect(store.write('x')).toEqual({ ok: false, error: { kind: 'quota-exceeded' } });
  });
});
