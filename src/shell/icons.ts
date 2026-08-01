/**
 * The site's icons.
 *
 * These replace the emoji the hub and the app bar used to draw. Emoji are a font
 * the site does not control: they arrive in whatever style the operating system
 * ships, so a flat two-colour glyph sat next to a shaded three-dimensional one,
 * none of them lined up on a common grid, and none of them took the text colour.
 * The result read as clip art. These are one stroke weight on one 24-unit grid,
 * drawn in `currentColor`, so they inherit the theme and the accent for free.
 *
 * Drawn as real elements through `core/dom.ts`, not as markup strings and not as
 * `data:` URLs — the Content Security Policy allows neither, and there is no
 * reason to want either.
 *
 * Paths only, no fills: a stroked outline stays legible at 16px and at 40px, and
 * one `stroke-width` keeps the whole set looking like one set.
 */

import type { IconName } from '../config/icons.js';
import { svgEl } from '../core/dom.js';

export type { IconName };

/**
 * One entry per icon: the `d` attributes of its paths, on a 24×24 grid.
 *
 * Kept as data rather than as nine functions so the set is obviously uniform and
 * a new one cannot arrive with its own viewBox or its own stroke weight.
 */
const PATHS: Readonly<Record<IconName, readonly string[]>> = {
  /* A nine-cell grid: the tool is a Sudoku board. */
  sudoku: ['M3 3h18v18H3z', 'M9 3v18', 'M15 3v18', 'M3 9h18', 'M3 15h18'],
  /* A bowl with steam over it. */
  rice: [
    'M3 12h18a9 9 0 0 1-18 0z',
    'M2 21h20',
    'M9 8c0-1.5 1.5-1.5 1.5-3',
    'M14 8c0-1.5 1.5-1.5 1.5-3',
  ],
  /* A stopwatch: dial, hand and crown. */
  time: ['M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M12 10v4l2.5 2.5', 'M9 2h6', 'M12 2v4'],
  /* A sugar cube, drawn as an isometric box. */
  sugar: ['M12 2 3 7v10l9 5 9-5V7l-9-5z', 'M3 7l9 5 9-5', 'M12 12v10'],
  /* A camera with a marker pin at its centre: the Picture Counter. */
  counter: [
    'M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z',
    'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ],
  /* A pot with a lid and a handle: the recipe collection. */
  recipes: ['M4 9h16v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z', 'M2 12h2', 'M20 12h2', 'M8 9V5h8v4'],
  /* A monitor: the theme follows the device. */
  system: ['M3 4h18v12H3z', 'M8 20h8', 'M12 16v4'],
  /* A sun. */
  light: [
    'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
    'M12 1v3',
    'M12 20v3',
    'M4.2 4.2l2.1 2.1',
    'M17.7 17.7l2.1 2.1',
    'M1 12h3',
    'M20 12h3',
    'M4.2 19.8l2.1-2.1',
    'M17.7 6.3l2.1-2.1',
  ],
  /* A crescent moon. */
  dark: ['M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z'],
  /* A microphone on its stand: push to talk. */
  microphone: [
    'M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z',
    'M5 11a7 7 0 0 0 14 0',
    'M12 18v4',
    'M8 22h8',
  ],
  /* A tray with an arrow going into it: choosing a file. */
  upload: ['M12 3v11', 'M8 7l4-4 4 4', 'M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4'],
  /* The same tray with the arrow coming out: saving one. */
  download: ['M12 14V3', 'M8 10l4 4 4-4', 'M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4'],
  /* An eye: highlight mistakes as I play. */
  eye: [
    'M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z',
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  ],
  play: ['M8 5.5v13l11-6.5-11-6.5z'],
  pause: ['M9 5v14', 'M15 5v14'],
  /* A single sugar cube, repeated to visualise an amount. */
  cube: ['M12 2 3 7v10l9 5 9-5V7l-9-5z', 'M3 7l9 5 9-5', 'M12 12v10'],
};

export interface IconOptions {
  /** Rendered size in pixels. Defaults to 20, which suits a button. */
  readonly size?: number;
}

/**
 * Build one icon.
 *
 * Always `aria-hidden`: every icon on this site sits beside or inside a control
 * that already has a text label or an `aria-label`, so announcing it a second
 * time would only add noise. There is deliberately no option to change that — an
 * icon that needs its own name is a picture, not an icon, and belongs in an
 * `<img>` with real alternative text.
 */
export function icon(name: IconName, options: IconOptions = {}): SVGElement {
  const size = options.size ?? 20;

  return svgEl(
    'svg',
    {
      class: 'icon',
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.6,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    ...PATHS[name].map((d) => svgEl('path', { d })),
  );
}
