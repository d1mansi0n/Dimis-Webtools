/**
 * The canonical description of what this site contains.
 *
 * This module is deliberately free of DOM and Node APIs so that it can be
 * imported by three very different consumers without duplication:
 *
 *   - `vite.config.ts`, to derive the multi-page build inputs and the
 *     redirect stubs for the legacy 1.0/2.0 URLs;
 *   - the hub page, to render the tool cards;
 *   - the end-to-end tests, to assert that every advertised page really ships.
 *
 * Adding a tool means adding one entry here and one directory. Nothing else
 * needs to learn about it.
 */

import type { IconName } from './icons.js';

/** Stable identifier for a tool. Used in URLs, translation keys and storage keys. */
export type ToolId = 'sudoku' | 'rice' | 'time' | 'sugar' | 'counter' | 'recipes';

export interface Tool {
  /** Stable id. Also the directory name and the URL segment. */
  readonly id: ToolId;
  /** Which icon the hub card shows. Purely decorative, hidden from assistive tech. */
  readonly icon: IconName;
  /**
   * Old file names that used to serve this tool, from the 1.0 and 2.0 layouts.
   * The build emits a redirect stub at each of these paths so existing
   * bookmarks and links keep resolving.
   */
  readonly legacyPaths: readonly string[];
}

export const TOOLS: readonly Tool[] = [
  { id: 'sudoku', icon: 'sudoku', legacyPaths: ['SDK-index.html', 'SDK-v2.html'] },
  { id: 'rice', icon: 'rice', legacyPaths: ['rcc-index.html', 'rcc-v2.html'] },
  { id: 'time', icon: 'time', legacyPaths: ['ZE-index.html', 'ZE-v2.html'] },
  { id: 'sugar', icon: 'sugar', legacyPaths: ['ZR-index.html', 'ZR-v2.html'] },
  { id: 'counter', icon: 'counter', legacyPaths: ['PC-index.html', 'PC-v2.html'] },
  /* Added after the rewrite, so there is no 1.0/2.0 file name to redirect from. */
  { id: 'recipes', icon: 'recipes', legacyPaths: [] },
] as const;

/** Every page the site ships, hub first. Relative to the deployment base. */
export const PAGES: readonly string[] = ['', ...TOOLS.map((tool) => `${tool.id}/`)];
