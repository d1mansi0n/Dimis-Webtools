/**
 * The win celebration: confetti over the page and a gold, pulsing headline.
 *
 * This is the one piece of pure decoration on the site, and it is deliberate.
 * Version 1.0 rained confetti and turned the heading gold the moment the last
 * digit went in; the rewrite replaced all of it with a green glow around the
 * board, which states that the puzzle is solved without ever celebrating it.
 * Finishing a hard Sudoku is the only moment here that has earned a flourish.
 *
 * Every piece is positioned and timed through custom properties rather than a
 * `style` attribute in markup, the same way the number ring is placed — the
 * Content Security Policy forbids the attribute, and the CSSOM is not a sink.
 * The colours live in the stylesheet, keyed by `data-tone`, so no colour value
 * is ever written from script.
 */

import { el } from '../../core/dom.js';

/**
 * Enough pieces to read as a shower rather than as a handful of falling
 * rectangles, and few enough that the browser animates them on the compositor
 * without complaint. 1.0 span up 250 nodes over five seconds; these are spread
 * across the same window by animation delay instead of by a `setInterval`, so
 * there is one timer for the whole celebration rather than one per wave.
 */
const PIECE_COUNT = 140;

/** How many colours the stylesheet defines as `data-tone` values. */
const TONE_COUNT = 6;

/** The window over which pieces start falling. */
const SPAWN_MS = 2400;

/** How long a single piece takes to cross the viewport, at its slowest. */
const FALL_MIN_MS = 3000;
const FALL_MAX_MS = 4500;

/**
 * The whole celebration, from the first piece leaving the top of the screen to
 * the last one leaving the bottom. The headline is gold for exactly this long.
 */
export const CELEBRATION_MS = SPAWN_MS + FALL_MAX_MS;

export interface Celebration {
  /** Begin, replacing a celebration already in flight. */
  start: () => void;
  /** End it now and take everything it added back off the page. */
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
  let timer: number | undefined;

  function stop(): void {
    window.clearTimeout(timer);
    timer = undefined;
    layer?.remove();
    layer = undefined;
    headline.removeAttribute('data-celebrating');
  }

  function start(): void {
    /* Solving a second puzzle before the first celebration has faded — or
       reaching a win, undoing it and reaching it again — must restart it, not
       leave two layers of confetti falling out of step. */
    stop();

    headline.setAttribute('data-celebrating', '');

    /*
     * Under a stated preference for less motion the confetti is not built at
     * all. `base.css` collapses every animation on the site to nothing, so the
     * pieces would sit as 140 motionless rectangles across the top of the
     * screen — worse than the flourish being absent. The gold headline stays,
     * because colour is not motion, and the win still deserves its moment.
     */
    if (!prefersReducedMotion()) {
      layer = el('div', {
        class: 'sudoku-confetti',
        /* Decoration with nothing to announce. The win itself is already spoken
           by the live region the message area carries. */
        attrs: { 'aria-hidden': 'true' },
      });
      for (let index = 0; index < PIECE_COUNT; index++) layer.append(piece(index));
      host.append(layer);
    }

    timer = window.setTimeout(stop, CELEBRATION_MS);
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
       represented instead of clumping the way a random draw of 140 does. */
    data: { tone: index % TONE_COUNT },
  });

  const style = node.style;
  style.setProperty('--x', `${String(round(Math.random() * 100))}%`);
  style.setProperty('--drift', `${String(round((Math.random() - 0.5) * 240))}px`);
  style.setProperty('--spin', `${String(round(360 + Math.random() * 720))}deg`);
  style.setProperty('--delay', `${String(round(Math.random() * SPAWN_MS))}ms`);
  style.setProperty(
    '--duration',
    `${String(round(FALL_MIN_MS + Math.random() * (FALL_MAX_MS - FALL_MIN_MS)))}ms`,
  );
  return node;
}

const round = (value: number): number => Math.round(value * 100) / 100;
