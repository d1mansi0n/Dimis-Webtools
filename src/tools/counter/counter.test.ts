import { describe, expect, it } from 'vitest';
import {
  addMarker,
  DEFAULT_MARKER_COLOR,
  exportFileName,
  findMarkerAt,
  labelOf,
  MAX_MARKER_SIZE,
  MIN_MARKER_SIZE,
  moveMarker,
  undoLast,
  type Marker,
} from './markers.js';
import {
  canvasToImage,
  clampViewport,
  fitViewport,
  imageToCanvas,
  MAX_ZOOM,
  minZoomFor,
  resizeViewport,
  zoomAt,
  type Size,
} from './viewport.js';

const CANVAS: Size = { width: 800, height: 600 };
const IMAGE: Size = { width: 1600, height: 1200 };

describe('minZoomFor', () => {
  it('is the larger reduction of the two axes, so the whole image fits', () => {
    expect(minZoomFor(CANVAS, IMAGE)).toBe(0.5);
    expect(minZoomFor({ width: 800, height: 600 }, { width: 1600, height: 300 })).toBe(0.5);
  });

  it('does not divide by a zero-sized image', () => {
    expect(minZoomFor(CANVAS, { width: 0, height: 0 })).toBe(1);
  });
});

describe('fitViewport', () => {
  it('shows the whole image', () => {
    const viewport = fitViewport(CANVAS, IMAGE);
    expect(viewport.zoom).toBe(0.5);
    expect(CANVAS.width / viewport.zoom).toBe(IMAGE.width);
  });

  it('centres an image with a different aspect ratio', () => {
    const wide: Size = { width: 1600, height: 400 };
    const viewport = fitViewport(CANVAS, wide);
    const visibleHeight = CANVAS.height / viewport.zoom;
    expect(viewport.offsetY).toBeCloseTo((wide.height - visibleHeight) / 2);
  });
});

describe('coordinate transforms', () => {
  it('round-trip', () => {
    const viewport = { zoom: 2, offsetX: 100, offsetY: 50 };
    const original = { x: 640, y: 480 };
    expect(canvasToImage(viewport, imageToCanvas(viewport, original))).toEqual(original);
  });

  it('maps the canvas origin to the viewport offset', () => {
    const viewport = { zoom: 3, offsetX: 12, offsetY: 34 };
    expect(canvasToImage(viewport, { x: 0, y: 0 })).toEqual({ x: 12, y: 34 });
  });
});

describe('clampViewport', () => {
  it('keeps the view inside the image', () => {
    const clamped = clampViewport({ zoom: 2, offsetX: -500, offsetY: 9999 }, CANVAS, IMAGE);
    expect(clamped.offsetX).toBe(0);
    expect(clamped.offsetY).toBe(IMAGE.height - CANVAS.height / 2);
  });

  it('centres the image when the view is larger than it', () => {
    const clamped = clampViewport({ zoom: 0.1, offsetX: 999, offsetY: 999 }, CANVAS, IMAGE);
    expect(clamped.offsetX).toBe((IMAGE.width - CANVAS.width / 0.1) / 2);
  });
});

describe('zoomAt', () => {
  it('holds the anchor point steady', () => {
    const before = fitViewport(CANVAS, IMAGE);
    const anchor = { x: 200, y: 150 };
    const imageBefore = canvasToImage(before, anchor);

    const after = zoomAt(before, 2, anchor, CANVAS, IMAGE);
    const imageAfter = canvasToImage(after, anchor);

    expect(imageAfter.x).toBeCloseTo(imageBefore.x, 6);
    expect(imageAfter.y).toBeCloseTo(imageBefore.y, 6);
  });

  it('will not zoom out past the fit-to-view level', () => {
    const fitted = fitViewport(CANVAS, IMAGE);
    expect(zoomAt(fitted, 0.1, { x: 400, y: 300 }, CANVAS, IMAGE).zoom).toBe(fitted.zoom);
  });

  it('will not zoom in past the maximum', () => {
    const fitted = fitViewport(CANVAS, IMAGE);
    expect(zoomAt(fitted, 1000, { x: 400, y: 300 }, CANVAS, IMAGE).zoom).toBe(MAX_ZOOM);
  });

  it('returns the same viewport when the zoom cannot change', () => {
    const fitted = fitViewport(CANVAS, IMAGE);
    expect(zoomAt(fitted, 1, { x: 0, y: 0 }, CANVAS, IMAGE)).toBe(fitted);
  });
});

describe('resizeViewport', () => {
  it('keeps the centre of the view on the same part of the image', () => {
    const before = zoomAt(fitViewport(CANVAS, IMAGE), 4, { x: 400, y: 300 }, CANVAS, IMAGE);
    const centreBefore = canvasToImage(before, { x: CANVAS.width / 2, y: CANVAS.height / 2 });

    const smaller: Size = { width: 400, height: 700 };
    const after = resizeViewport(before, CANVAS, smaller, IMAGE);
    const centreAfter = canvasToImage(after, { x: smaller.width / 2, y: smaller.height / 2 });

    expect(centreAfter.x).toBeCloseTo(centreBefore.x, 4);
    expect(centreAfter.y).toBeCloseTo(centreBefore.y, 4);
  });

  it('raises the zoom when the new canvas needs a larger minimum', () => {
    const fitted = fitViewport(CANVAS, IMAGE);
    const bigger: Size = { width: 3200, height: 2400 };
    expect(resizeViewport(fitted, CANVAS, bigger, IMAGE).zoom).toBe(2);
  });
});

describe('markers', () => {
  const at = (x: number, y: number): Marker => ({ x, y, color: DEFAULT_MARKER_COLOR, size: 20 });

  it('numbers markers from one, derived from position', () => {
    expect(labelOf(0)).toBe(1);
    expect(labelOf(9)).toBe(10);
  });

  it('appends a marker', () => {
    const markers = addMarker([], { x: 5, y: 6 }, '#00ff00', 30);
    expect(markers).toEqual([{ x: 5, y: 6, color: '#00ff00', size: 30 }]);
  });

  it('clamps the marker size to the allowed range', () => {
    expect(addMarker([], { x: 0, y: 0 }, '#000000', 5)[0]?.size).toBe(MIN_MARKER_SIZE);
    expect(addMarker([], { x: 0, y: 0 }, '#000000', 500)[0]?.size).toBe(MAX_MARKER_SIZE);
  });

  it('renumbers automatically after an undo', () => {
    const markers = [at(1, 1), at(2, 2), at(3, 3)];
    const after = undoLast(markers);
    expect(after).toHaveLength(2);
    expect(labelOf(after.length - 1)).toBe(2);
  });

  it('undoing an empty list is harmless', () => {
    expect(undoLast([])).toEqual([]);
  });

  it('moves a marker', () => {
    expect(moveMarker([at(0, 0)], 0, { x: 9, y: 9 })[0]).toMatchObject({ x: 9, y: 9 });
  });

  it('ignores a move for an index that does not exist', () => {
    const markers = [at(0, 0)];
    expect(moveMarker(markers, 5, { x: 9, y: 9 })).toEqual(markers);
  });

  describe('hit testing', () => {
    it('finds a marker under the point', () => {
      expect(findMarkerAt([at(100, 100)], { x: 105, y: 100 }, 1)).toBe(0);
    });

    it('misses a point outside every marker', () => {
      expect(findMarkerAt([at(100, 100)], { x: 400, y: 400 }, 1)).toBe(-1);
    });

    it('prefers the topmost marker where two overlap', () => {
      expect(findMarkerAt([at(100, 100), at(102, 100)], { x: 101, y: 100 }, 1)).toBe(1);
    });

    it('grows the hit area when zoomed out, so small markers stay grabbable', () => {
      const markers = [at(100, 100)];
      /* 40 image pixels away: outside the 16-pixel marker radius, but well inside
         the 12-canvas-pixel floor once the view is at 0.1x. */
      expect(findMarkerAt(markers, { x: 140, y: 100 }, 1)).toBe(-1);
      expect(findMarkerAt(markers, { x: 140, y: 100 }, 0.1)).toBe(0);
    });

    it('finds nothing in an empty list', () => {
      expect(findMarkerAt([], { x: 0, y: 0 }, 1)).toBe(-1);
    });
  });

  it('names the exported file after the date and count', () => {
    expect(exportFileName('2026-07-29', 12)).toBe('counted-2026-07-29-12-markers.png');
  });
});
