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
}

export const TOOLS: readonly Tool[] = [
  { id: 'sudoku', icon: 'sudoku' },
  { id: 'rice', icon: 'rice' },
  { id: 'time', icon: 'time' },
  { id: 'sugar', icon: 'sugar' },
  { id: 'counter', icon: 'counter' },
  { id: 'recipes', icon: 'recipes' },
] as const;

/** Every page the site ships, hub first. Relative to the deployment base. */
export const PAGES: readonly string[] = ['', ...TOOLS.map((tool) => `${tool.id}/`)];
