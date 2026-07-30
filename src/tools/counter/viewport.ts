/**
 * Picture Counter — zoom and pan arithmetic.
 *
 * Pure functions over plain values, so the coordinate transforms can be tested
 * without a canvas. Everything here works in two spaces:
 *
 *  - **image space**: pixels of the source image. Markers are stored here, so
 *    they stay put when the view is zoomed, panned or the window is resized.
 *  - **canvas space**: pixels of the visible canvas element.
 */

import { clamp } from '../../core/math.js';

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Viewport {
  /** Canvas pixels per image pixel. */
  readonly zoom: number;
  /** Image-space coordinate shown at the canvas's top-left corner. */
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Furthest in the user may zoom. */
export const MAX_ZOOM = 20;

/** Multiplier applied by one zoom-button press or wheel notch. */
export const ZOOM_STEP = 1.1;

/**
 * The zoom at which the whole image is visible.
 *
 * Also the minimum: zooming out past the point where the image fits would only
 * add empty space around it.
 */
export function minZoomFor(canvas: Size, image: Size): number {
  if (image.width <= 0 || image.height <= 0) return 1;
  return Math.min(canvas.width / image.width, canvas.height / image.height);
}

/** Centre the image in the canvas at the fit-to-view zoom. */
export function fitViewport(canvas: Size, image: Size): Viewport {
  const zoom = minZoomFor(canvas, image);
  return clampViewport(
    {
      zoom,
      offsetX: (image.width - canvas.width / zoom) / 2,
      offsetY: (image.height - canvas.height / zoom) / 2,
    },
    canvas,
    image,
  );
}

/**
 * Keep the view over the image.
 *
 * When the visible area is larger than the image along an axis, the image is
 * centred on that axis instead of being pinned to a corner.
 */
export function clampViewport(viewport: Viewport, canvas: Size, image: Size): Viewport {
  const visibleWidth = canvas.width / viewport.zoom;
  const visibleHeight = canvas.height / viewport.zoom;

  return {
    zoom: viewport.zoom,
    offsetX:
      visibleWidth >= image.width
        ? (image.width - visibleWidth) / 2
        : clamp(viewport.offsetX, 0, image.width - visibleWidth),
    offsetY:
      visibleHeight >= image.height
        ? (image.height - visibleHeight) / 2
        : clamp(viewport.offsetY, 0, image.height - visibleHeight),
  };
}

export function canvasToImage(viewport: Viewport, point: Point): Point {
  return {
    x: viewport.offsetX + point.x / viewport.zoom,
    y: viewport.offsetY + point.y / viewport.zoom,
  };
}

export function imageToCanvas(viewport: Viewport, point: Point): Point {
  return {
    x: (point.x - viewport.offsetX) * viewport.zoom,
    y: (point.y - viewport.offsetY) * viewport.zoom,
  };
}

/**
 * Zoom about a fixed point.
 *
 * The image coordinate under `centre` stays under `centre` afterwards, which is
 * what makes pinch and wheel zoom feel anchored rather than drifting.
 */
export function zoomAt(
  viewport: Viewport,
  factor: number,
  centre: Point,
  canvas: Size,
  image: Size,
): Viewport {
  const minZoom = minZoomFor(canvas, image);
  const zoom = clamp(viewport.zoom * factor, minZoom, Math.max(minZoom, MAX_ZOOM));
  if (zoom === viewport.zoom) return viewport;

  const anchor = canvasToImage(viewport, centre);
  return clampViewport(
    {
      zoom,
      offsetX: anchor.x - centre.x / zoom,
      offsetY: anchor.y - centre.y / zoom,
    },
    canvas,
    image,
  );
}

/**
 * Recompute the viewport after the canvas changes size, holding the image point
 * at the centre of the view steady.
 *
 * Version 1.0 had no resize handling at all: rotating a phone left the canvas at
 * its old size with the image drawn into a corner.
 */
export function resizeViewport(
  viewport: Viewport,
  previousCanvas: Size,
  canvas: Size,
  image: Size,
): Viewport {
  const centre = canvasToImage(viewport, {
    x: previousCanvas.width / 2,
    y: previousCanvas.height / 2,
  });
  const minZoom = minZoomFor(canvas, image);
  const zoom = clamp(viewport.zoom, minZoom, Math.max(minZoom, MAX_ZOOM));

  return clampViewport(
    {
      zoom,
      offsetX: centre.x - canvas.width / (2 * zoom),
      offsetY: centre.y - canvas.height / (2 * zoom),
    },
    canvas,
    image,
  );
}
