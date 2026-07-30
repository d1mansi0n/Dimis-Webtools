/**
 * The puzzle generator, off the main thread.
 *
 * Generation takes anywhere from a few milliseconds to a second or so depending
 * on how the backtracking falls, which is more than enough to drop frames or
 * freeze a tap on a phone.
 *
 * This is a real module worker, bundled to its own file. Version 2.0 built its
 * worker by reading the text of an inline `<script>` and wrapping it in a
 * `Blob` — which works, but forces the Content Security Policy to allow
 * `worker-src blob:`, and blob workers are a well-worn way to smuggle code past
 * a policy. Shipping the worker as an ordinary same-origin script keeps
 * `worker-src 'self'`.
 */

import { DIFFICULTY_CLUES, generatePuzzle, type GeneratedDifficulty } from './generator.js';
import type { Board } from './board.js';

export interface GenerateRequest {
  /** Correlates a response with its request, so a stale reply can be ignored. */
  readonly id: number;
  readonly difficulty: GeneratedDifficulty;
}

export type GenerateResponse =
  | { readonly id: number; readonly ok: true; readonly puzzle: Board; readonly solution: Board }
  | { readonly id: number; readonly ok: false; readonly error: string };

self.addEventListener('message', (event: MessageEvent<GenerateRequest>) => {
  const { id, difficulty } = event.data;

  try {
    const clues = DIFFICULTY_CLUES[difficulty];
    const { puzzle, solution } = generatePuzzle(clues);
    const response: GenerateResponse = { id, ok: true, puzzle, solution };
    self.postMessage(response);
  } catch (cause) {
    const response: GenerateResponse = {
      id,
      ok: false,
      error: cause instanceof Error ? cause.message : String(cause),
    };
    self.postMessage(response);
  }
});
