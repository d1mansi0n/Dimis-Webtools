/**
 * Picture Counter — the markers themselves.
 *
 * Coordinates are in image space, so markers stay attached to what they mark
 * through any amount of zooming, panning and resizing.
 */

import { clamp } from '../../core/math.js';
import type { Point } from './viewport.js';

export const MIN_MARKER_SIZE = 10;
export const MAX_MARKER_SIZE = 100;
export const DEFAULT_MARKER_SIZE = 20;
export const DEFAULT_MARKER_COLOR = '#ff0000';

export interface Marker {
  /** Position in image pixels. */
  readonly x: number;
  readonly y: number;
  /** Fill colour, as a `#rrggbb` string. */
  readonly color: string;
  /** Diameter basis in image pixels, independent of the current zoom. */
  readonly size: number;
}

/**
 * The number drawn on a marker.
 *
 * Derived from position rather than stored. Version 2.0 kept a separate
 * `nextNumber` counter that it incremented on add and decremented on undo,
 * which could drift out of step with the list; deriving it makes that
 * impossible.
 */
export function labelOf(index: number): number {
  return index + 1;
}

export function addMarker(
  markers: readonly Marker[],
  at: Point,
  color: string,
  size: number,
): Marker[] {
  return [
    ...markers,
    { x: at.x, y: at.y, color, size: clamp(size, MIN_MARKER_SIZE, MAX_MARKER_SIZE) },
  ];
}

export function undoLast(markers: readonly Marker[]): Marker[] {
  return markers.slice(0, -1);
}

export function moveMarker(markers: readonly Marker[], index: number, to: Point): Marker[] {
  if (index < 0 || index >= markers.length) return [...markers];
  return markers.map((marker, position) =>
    position === index ? { ...marker, x: to.x, y: to.y } : marker,
  );
}

/**
 * Index of the marker under a point in image space, or `-1`.
 *
 * Searched newest-first so the marker drawn on top is the one picked up. The hit
 * radius has a floor expressed in canvas pixels, which keeps small markers
 * grabbable when zoomed out — without it, a 10-pixel marker at 0.1x zoom would
 * need sub-pixel accuracy to touch.
 */
export function findMarkerAt(
  markers: readonly Marker[],
  at: Point,
  zoom: number,
  minimumCanvasRadius = 12,
): number {
  for (let index = markers.length - 1; index >= 0; index--) {
    const marker = markers[index];
    if (marker === undefined) continue;
    const radius = Math.max(marker.size * 0.8, minimumCanvasRadius / zoom);
    if (Math.hypot(at.x - marker.x, at.y - marker.y) < radius) return index;
  }
  return -1;
}

/** File name for a saved annotated image. */
export function exportFileName(isoDate: string, count: number): string {
  return `counted-${isoDate}-${String(count)}-markers.png`;
}
