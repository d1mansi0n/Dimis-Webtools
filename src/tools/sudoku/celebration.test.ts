import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CELEBRATION_MS, createCelebration } from './celebration.js';

describe('createCelebration', () => {
  let heading: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    prefersReducedMotion(false);
    heading = document.createElement('h1');
    document.body.append(heading);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const pieces = (): NodeListOf<Element> => document.querySelectorAll('.sudoku-confetti__piece');

  /* jsdom implements no `matchMedia` whatsoever, so every test has to supply
     one — there is nothing here to mock over. */
  function prefersReducedMotion(reduce: boolean): void {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce, media: query }));
  }

  it('rains confetti and marks the headline when it starts', () => {
    createCelebration(heading).start();

    expect(document.querySelectorAll('.sudoku-confetti')).toHaveLength(1);
    expect(pieces().length).toBeGreaterThan(0);
    expect(heading.hasAttribute('data-celebrating')).toBe(true);
  });

  it('gives every piece a column, a drift, a spin and a time of its own', () => {
    createCelebration(heading).start();

    for (const piece of pieces()) {
      const style = (piece as HTMLElement).style;
      for (const property of ['--x', '--drift', '--spin', '--delay', '--duration']) {
        expect(style.getPropertyValue(property)).not.toBe('');
      }
    }
  });

  it('uses each of the six colours, rather than leaving the draw to chance', () => {
    createCelebration(heading).start();

    const tones = new Set([...pieces()].map((piece) => (piece as HTMLElement).dataset['tone']));
    expect([...tones].sort()).toEqual(['0', '1', '2', '3', '4', '5']);
  });

  it('takes everything back off the page once the last piece has fallen', () => {
    createCelebration(heading).start();
    vi.advanceTimersByTime(CELEBRATION_MS);

    expect(document.querySelector('.sudoku-confetti')).toBeNull();
    expect(heading.hasAttribute('data-celebrating')).toBe(false);
  });

  it('restarts rather than stacking a second layer over the first', () => {
    const celebration = createCelebration(heading);
    celebration.start();
    vi.advanceTimersByTime(CELEBRATION_MS / 2);
    celebration.start();

    expect(document.querySelectorAll('.sudoku-confetti')).toHaveLength(1);

    /* The clock restarted with it: the first celebration's remaining time must
       not carry the second one away early. */
    vi.advanceTimersByTime(CELEBRATION_MS / 2);
    expect(document.querySelector('.sudoku-confetti')).not.toBeNull();

    vi.advanceTimersByTime(CELEBRATION_MS / 2);
    expect(document.querySelector('.sudoku-confetti')).toBeNull();
  });

  it("stops on request, so a new puzzle does not begin under the last one's confetti", () => {
    const celebration = createCelebration(heading);
    celebration.start();
    celebration.stop();

    expect(document.querySelector('.sudoku-confetti')).toBeNull();
    expect(heading.hasAttribute('data-celebrating')).toBe(false);
  });

  it('is harmless to stop when nothing is running', () => {
    expect(() => {
      createCelebration(heading).stop();
    }).not.toThrow();
  });

  it('drops the confetti but keeps the gold when less motion is asked for', () => {
    prefersReducedMotion(true);
    createCelebration(heading).start();

    /* `base.css` collapses every animation to nothing under that preference, so
       the pieces would hang motionless across the top of the screen. Colour is
       not motion, so the headline still gets its moment. */
    expect(document.querySelector('.sudoku-confetti')).toBeNull();
    expect(heading.hasAttribute('data-celebrating')).toBe(true);

    vi.advanceTimersByTime(CELEBRATION_MS);
    expect(heading.hasAttribute('data-celebrating')).toBe(false);
  });

  it('appends to the host it is given', () => {
    const host = document.createElement('div');
    document.body.append(host);
    createCelebration(heading, host).start();

    expect(host.querySelector('.sudoku-confetti')).not.toBeNull();
  });
});
