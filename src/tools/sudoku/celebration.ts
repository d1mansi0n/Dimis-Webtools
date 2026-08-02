/**
 * The win celebration: confetti over the page and a gold, pulsing headline.
 *
 * This is the one piece of pure decoration on the site, and it is deliberate.
 * Version 1.0 rained confetti and turned the heading gold the moment the last
 * digit went in; the rewrite replaced all of it with a green glow around the
 * board, which states that the puzzle is solved without ever celebrating it.
 * Finishing a hard Sudoku is the only moment here that has earned a flourish.
 *
 * It runs until the player is done with it — a new puzzle, a reset or a loaded
 * game ends it, and nothing else does. There is deliberately no timer: 1.0 gave
 * the moment five seconds and took it away again, and a celebration on a clock
 * is a celebration that ends while you are still looking at the board you just
 * finished.
 *
 * Every piece is positioned and timed through custom properties rather than a
 * `style` attribute in markup, the same way the number ring is placed — the
 * Content Security Policy forbids the attribute, and the CSSOM is not a sink.
 * The colours live in the stylesheet, keyed by `data-tone`, so no colour value
 * is ever written from script.
 */

import { el } from '../../core/dom.js';

/**
 * How many pieces are in the air.
 *
 * Each one loops for as long as the celebration lasts, so this is the *steady*
 * population rather than a total ever spawned: a piece that has fallen off the
 * bottom starts again at the top instead of being replaced by a new node. That
 * is what makes an endless rain cost nothing after the first frame — no
 * interval, no allocation, no garbage.
 *
 * The figure comes from 1.0's density. It released ten pieces every 200ms and
 * each fell for four seconds, so about two hundred were on screen at any moment
 * once the shower was up to speed.
 */
const PIECE_COUNT = 280;

/**
 * The window the pieces' first falls are staggered across.
 *
 * Only the first: an animation delay applies once, so after this the rain is
 * continuous. It exists so the shower builds over a moment rather than all 280
 * pieces dropping in one rank — which is what the first version of this module
 * did for its whole duration, and why it read as a single burst.
 */
const STAGGER_MS = 2500;

/** How many colours the stylesheet defines as `data-tone` values. */
const TONE_COUNT = 6;

/** How long a single piece takes to cross the viewport, at its fastest and slowest. */
const FALL_MIN_MS = 3500;
const FALL_MAX_MS = 5000;

export interface Celebration {
  /** Begin, replacing a celebration already in flight. */
  start: () => void;
  /** End it and take everything it added back off the page. */
  stop: () => void;
}

/**
 * Wire a celebration to a headline.
 *
 * `host` is where the confetti layer is appended; it is the body in the
 * application and an explicit element in tests.
 */
export function createCelebration(
  headline: HTMLElement,
  host: HTMLElement = document.body,
): Celebration {
  let layer: HTMLElement | undefined;

  function stop(): void {
    layer?.remove();
    layer = undefined;
    headline.removeAttribute('data-celebrating');
  }

  function start(): void {
    /* Reaching a win, undoing it and reaching it again must restart the
       celebration, not leave two layers of confetti falling out of step. */
    stop();

    headline.setAttribute('data-celebrating', '');

    /*
     * Under a stated preference for less motion the confetti is not built at
     * all. `base.css` collapses every animation on the site to nothing, so the
     * pieces would hang as hundreds of motionless rectangles across the top of
     * the screen — and, with no timer to end them, they would hang there until
     * the next puzzle. The gold headline stays, because colour is not motion,
     * and the win still deserves its moment.
     */
    if (prefersReducedMotion()) return;

    layer = el('div', {
      class: 'sudoku-confetti',
      /* Decoration with nothing to announce. The win itself is already spoken
         by the live region the message area carries. */
      attrs: { 'aria-hidden': 'true' },
    });
    for (let index = 0; index < PIECE_COUNT; index++) layer.append(piece(index));
    host.append(layer);
  }

  return { start, stop };
}

/**
 * Whether the visitor has asked for less motion.
 *
 * jsdom implements no `matchMedia` at all, so the tests supply one; guarding
 * for it here would be writing a branch for a browser that does not exist.
 */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** One falling piece, with its own column, drift, spin, delay and speed. */
function piece(index: number): HTMLElement {
  const node = el('div', {
    class: 'sudoku-confetti__piece',
    /* Cycled rather than randomised, so the six colours are always evenly
       represented instead of clumping the way a random draw does. */
    data: { tone: index % TONE_COUNT },
  });

  const style = node.style;
  style.setProperty('--x', `${String(round(Math.random() * 100))}%`);
  style.setProperty('--drift', `${String(round((Math.random() - 0.5) * 240))}px`);
  style.setProperty('--spin', `${String(round(360 + Math.random() * 720))}deg`);
  style.setProperty('--delay', `${String(round(Math.random() * STAGGER_MS))}ms`);
  /* A spread of speeds, so the loop never resolves into every piece crossing
     the screen in lockstep the way a single duration would. */
  style.setProperty(
    '--duration',
    `${String(round(FALL_MIN_MS + Math.random() * (FALL_MAX_MS - FALL_MIN_MS)))}ms`,
  );
  return node;
}

const round = (value: number): number => Math.round(value * 100) / 100;
