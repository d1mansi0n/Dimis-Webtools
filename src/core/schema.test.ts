import { describe, expect, it } from 'vitest';
import {
  arrayOf,
  boolean,
  decodeJson,
  inRange,
  integer,
  lenientArrayOf,
  literals,
  maxLength,
  nullish,
  number,
  objectOf,
  string,
  tupleOf,
  withDefault,
} from './schema.js';

describe('primitive decoders', () => {
  it('accepts values of the right type', () => {
    expect(string('hello')).toEqual({ ok: true, value: 'hello' });
    expect(boolean(false)).toEqual({ ok: true, value: false });
    expect(number(1.5)).toEqual({ ok: true, value: 1.5 });
    expect(integer(42)).toEqual({ ok: true, value: 42 });
  });

  it('rejects values of the wrong type and says where', () => {
    const result = string(7, 'entry.comment');
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toBe('entry.comment: expected a string, got number');
  });

  it.each([NaN, Infinity, -Infinity])('rejects %s as a number', (value) => {
    expect(number(value).ok).toBe(false);
  });

  it('rejects non-integers and unsafe integers', () => {
    expect(integer(1.5).ok).toBe(false);
    expect(integer(Number.MAX_SAFE_INTEGER + 2).ok).toBe(false);
  });

  it('distinguishes null and arrays from objects in its error text', () => {
    expect(string(null).ok ? '' : (string(null) as { error: string }).error).toContain('got null');
    expect(string([]).ok ? '' : (string([]) as { error: string }).error).toContain('got an array');
  });
});

describe('refinements', () => {
  it('enforces an inclusive numeric range', () => {
    const ratio = inRange(number, 0.1, 10);
    expect(ratio(0.1).ok).toBe(true);
    expect(ratio(10).ok).toBe(true);
    expect(ratio(0.05).ok).toBe(false);
    expect(ratio(10.1).ok).toBe(false);
  });

  it('enforces a maximum string length', () => {
    const short = maxLength(string, 3);
    expect(short('abc').ok).toBe(true);
    expect(short('abcd').ok).toBe(false);
  });

  it('accepts only the listed literals', () => {
    const difficulty = literals('easy', 'hard');
    expect(difficulty('easy')).toEqual({ ok: true, value: 'easy' });
    expect(difficulty('medium').ok).toBe(false);
  });
});

describe('structures', () => {
  it('decodes arrays element by element', () => {
    expect(arrayOf(number)([1, 2, 3])).toEqual({ ok: true, value: [1, 2, 3] });
  });

  it('reports the index of the first bad element', () => {
    const result = arrayOf(number)([1, 'two', 3], 'sessions');
    expect(result.ok ? '' : result.error).toBe('sessions[1]: expected a finite number, got string');
  });

  it('requires an exact length for tuples', () => {
    const row = tupleOf(integer, 3);
    expect(row([1, 2, 3]).ok).toBe(true);
    expect(row([1, 2]).ok).toBe(false);
    expect(row([1, 2, 3, 4]).ok).toBe(false);
  });

  it('decodes object shapes and ignores unknown keys', () => {
    const decoder = objectOf({ id: integer, label: string });
    expect(decoder({ id: 1, label: 'a', extra: true })).toEqual({
      ok: true,
      value: { id: 1, label: 'a' },
    });
  });

  it('reports the failing property path in nested objects', () => {
    const decoder = objectOf({ inner: objectOf({ count: integer }) });
    const result = decoder({ inner: { count: 'nope' } });
    expect(result.ok ? '' : result.error).toBe('inner.count: expected a safe integer, got string');
  });

  it('accepts both missing and null for a nullish field', () => {
    const decoder = objectOf({ note: nullish(string) });
    expect(decoder({})).toEqual({ ok: true, value: { note: undefined } });
    expect(decoder({ note: null })).toEqual({ ok: true, value: { note: undefined } });
    expect(decoder({ note: 'hi' })).toEqual({ ok: true, value: { note: 'hi' } });
  });

  it('still type-checks a nullish field that is present', () => {
    expect(objectOf({ note: nullish(string) })({ note: 7 }).ok).toBe(false);
  });

  it('substitutes a default for missing, null and invalid values', () => {
    const decoder = withDefault(number, 1.2);
    expect(decoder(undefined)).toEqual({ ok: true, value: 1.2 });
    expect(decoder(null)).toEqual({ ok: true, value: 1.2 });
    expect(decoder('not a number')).toEqual({ ok: true, value: 1.2 });
    expect(decoder(2)).toEqual({ ok: true, value: 2 });
  });

  it('drops only the bad elements in a lenient array', () => {
    const result = lenientArrayOf(objectOf({ id: integer }))([{ id: 1 }, { id: 'x' }, { id: 3 }]);
    expect(result).toEqual({ ok: true, value: [{ id: 1 }, { id: 3 }] });
  });

  it('rejects a non-array outright even when lenient', () => {
    expect(lenientArrayOf(integer)({}).ok).toBe(false);
  });
});

describe('decodeJson', () => {
  it('parses and decodes in one step', () => {
    expect(decodeJson(arrayOf(integer), '[1,2]')).toEqual({ ok: true, value: [1, 2] });
  });

  it('reports malformed JSON without throwing', () => {
    const result = decodeJson(integer, '{oops');
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toMatch(/^invalid JSON/);
  });

  it('reports well-formed JSON that fails the schema', () => {
    const result = decodeJson(integer, '"7"');
    expect(result.ok ? '' : result.error).toBe('value: expected a safe integer, got string');
  });
});
