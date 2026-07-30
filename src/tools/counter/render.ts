/**
 * Picture Counter — canvas drawing.
 *
 * Shared by the on-screen view and the saved image. Both call `drawMarker` with
 * a different transform, which is what guarantees the exported PNG looks like
 * what was on screen: there is only one piece of drawing code.
 */

import { labelOf, type Marker } from './markers.js';
import { imageToCanvas, type Size, type Viewport } from './viewport.js';

/** Marker radius as a fraction of its nominal size. */
const RADIUS_RATIO = 0.72;

/** Outline width as a fraction of size, so it scales with the marker. */
const OUTLINE_RATIO = 0.08;

const OUTLINE_COLOR = '#ffffff';
const LABEL_COLOR = '#ffffff';

/**
 * Draw one numbered badge.
 *
 * `scale` converts the marker's image-space size into the destination's units:
 * the zoom level when drawing to the view, and 1 when drawing at full image
 * resolution for export.
 */
export function drawMarker(
  context: CanvasRenderingContext2D,
  marker: Marker,
  index: number,
  centre: { x: number; y: number },
  scale: number,
): void {
  const size = marker.size * scale;
  const radius = size * RADIUS_RATIO;
  const label = String(labelOf(index));

  context.beginPath();
  context.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
  context.fillStyle = marker.color;
  context.fill();

  /* A white ring keeps the badge legible on a photo of any colour. */
  context.lineWidth = Math.max(1, size * OUTLINE_RATIO);
  context.strokeStyle = OUTLINE_COLOR;
  context.stroke();

  /* Three-digit labels get a smaller face so they stay inside the circle. */
  const fontScale = label.length > 2 ? 0.62 : 0.8;
  context.font = `700 ${String(size * fontScale)}px ui-sans-serif, system-ui, Arial, sans-serif`;
  context.fillStyle = LABEL_COLOR;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, centre.x, centre.y);
}

/** Draw the image and its markers into the on-screen canvas. */
export function drawView(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource & Size,
  markers: readonly Marker[],
  viewport: Viewport,
  canvas: Size,
): void {
  context.clearRect(0, 0, canvas.width, canvas.height);

  /* Only the visible rectangle of the source is copied, so zooming into a large
     photograph costs the same as viewing a small one. */
  const sourceX = Math.max(0, viewport.offsetX);
  const sourceY = Math.max(0, viewport.offsetY);
  const sourceWidth = Math.min(
    image.width - sourceX,
    canvas.width / viewport.zoom + (viewport.offsetX - sourceX),
  );
  const sourceHeight = Math.min(
    image.height - sourceY,
    canvas.height / viewport.zoom + (viewport.offsetY - sourceY),
  );

  if (sourceWidth > 0 && sourceHeight > 0) {
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      (sourceX - viewport.offsetX) * viewport.zoom,
      (sourceY - viewport.offsetY) * viewport.zoom,
      sourceWidth * viewport.zoom,
      sourceHeight * viewport.zoom,
    );
  }

  markers.forEach((marker, index) => {
    const centre = imageToCanvas(viewport, marker);
    const radius = marker.size * RADIUS_RATIO * viewport.zoom;
    /* Skip anything entirely off-screen rather than asking the canvas to clip it. */
    if (
      centre.x + radius < 0 ||
      centre.x - radius > canvas.width ||
      centre.y + radius < 0 ||
      centre.y - radius > canvas.height
    ) {
      return;
    }
    drawMarker(context, marker, index, centre, viewport.zoom);
  });
}

/**
 * Render the annotated image at full source resolution.
 *
 * Drawn on an off-screen canvas so the export is unaffected by how the user
 * happens to be zoomed, and the visible view is never disturbed.
 */
export function renderForExport(
  image: CanvasImageSource & Size,
  markers: readonly Marker[],
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext('2d');
  if (context === null) throw new Error('This browser did not provide a 2D canvas context.');

  context.drawImage(image, 0, 0);
  markers.forEach((marker, index) => {
    drawMarker(context, marker, index, { x: marker.x, y: marker.y }, 1);
  });
  return canvas;
}
