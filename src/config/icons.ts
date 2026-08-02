/**
 * The names of the icons the site draws.
 *
 * The union lives here, beside the tool catalogue, rather than next to the paths
 * in `shell/icons.ts`. `site.ts` names an icon per tool and has to stay free of
 * DOM types — it is imported by `vite.config.ts` and by the end-to-end specs,
 * neither of which runs in a browser — while the drawing code is unavoidably
 * full of them. Splitting the name from the geometry keeps both honest, and the
 * two are tied together by `shell/icons.ts` having to satisfy this union.
 */
export type IconName =
  | 'sudoku'
  | 'rice'
  | 'time'
  | 'sugar'
  | 'counter'
  | 'recipes'
  | 'system'
  | 'light'
  | 'dark'
  | 'upload'
  | 'download'
  | 'eye'
  | 'play'
  | 'pause'
  | 'cube'
  | 'back'
  | 'forward';
