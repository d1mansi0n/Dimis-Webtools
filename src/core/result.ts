/**
 * A tiny explicit result type.
 *
 * Every operation in this codebase that can fail for reasons the caller is
 * expected to handle — decoding untrusted storage, writing to a full quota,
 * parsing user input — returns one of these instead of throwing or returning
 * `null`. Exceptions stay reserved for programmer errors, which is what makes
 * the boot-time invariant checks in `dom.ts` meaningful.
 */

export type Result<T, E = string> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
