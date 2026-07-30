import '../../styles/app.css';
import './counter.css';

import { el, requireElement } from '../../core/dom.js';
import { toIsoDate } from '../../core/format.js';
import { clamp } from '../../core/math.js';
import { plural, t } from '../../i18n/index.js';
import { boot } from '../../shell/boot.js';
import { confirmDialog } from '../../shell/dialog.js';
import {
  addMarker,
  DEFAULT_MARKER_COLOR,
  DEFAULT_MARKER_SIZE,
  exportFileName,
  findMarkerAt,
  MAX_MARKER_SIZE,
  MIN_MARKER_SIZE,
  moveMarker,
  undoLast,
  type Marker,
} from './markers.js';
import { drawView, renderForExport } from './render.js';
import {
  canvasToImage,
  clampViewport,
  fitViewport,
  resizeViewport,
  ZOOM_STEP,
  zoomAt,
  type Point,
  type Size,
  type Viewport,
} from './viewport.js';

/**
 * Largest image accepted.
 *
 * A guard against accidentally choosing a huge file: decoding it would allocate
 * roughly width × height × 4 bytes and can take a tab down. Version 2.0 also read
 * the file through `readAsDataURL`, which held the whole picture a second time as
 * a base64 string; an object URL hands the bytes to the decoder directly.
 */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** How far a pointer may travel before a tap becomes a drag. */
const DRAG_THRESHOLD_PX = 8;

type Interaction =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending'; readonly markerIndex: number; readonly origin: Point }
  | { readonly kind: 'draggingMarker'; readonly markerIndex: number; readonly grabOffset: Point }
  | { readonly kind: 'panning'; readonly origin: Point; readonly startViewport: Viewport }
  | { readonly kind: 'pinching'; readonly lastDistance: number };

boot({
  start() {
    const stage = requireElement('[data-counter="stage"]');
    const canvas = requireElement<HTMLCanvasElement>('[data-counter="canvas"]');
    const overlay = requireElement('[data-counter="overlay"]');
    const countBadge = requireElement('[data-counter="count"]');
    const errorMessage = requireElement('[data-counter="error"]');
    const fileInput = requireElement<HTMLInputElement>('#counter-file');
    const colorInput = requireElement<HTMLInputElement>('#counter-color');
    const sizeSlider = requireElement<HTMLInputElement>('#counter-size');
    const sizeNumber = requireElement<HTMLInputElement>('#counter-size-number');
    const lockCheckbox = requireElement<HTMLInputElement>('#counter-lock');

    const canvasContext = canvas.getContext('2d');
    if (canvasContext === null) {
      errorMessage.textContent = t('counter.failed');
      return;
    }
    /* Re-bound after the null check so the narrowing survives into the closures
       below, which is not guaranteed for the original binding. */
    const context = canvasContext;

    /* ------------------------------------------------------------------ state */
    let image: HTMLImageElement | undefined;
    let imageUrl: string | undefined;
    let markers: Marker[] = [];
    let viewport: Viewport = { zoom: 1, offsetX: 0, offsetY: 0 };
    let interaction: Interaction = { kind: 'idle' };
    let locked = false;
    let color = DEFAULT_MARKER_COLOR;
    let markerSize = DEFAULT_MARKER_SIZE;

    const pointers = new Map<number, { client: Point; canvas: Point; type: string }>();

    /* ----------------------------------------------------------------- chrome */
    document.title = `${t('tool.counter.name')} · ${t('app.name')}`;
    requireElement('[data-counter="title"]').textContent = t('tool.counter.name');
    requireElement('[data-counter="upload"]').textContent = t('counter.upload');
    requireElement('[data-counter="colorLabel"]').textContent = t('counter.color');
    requireElement('[data-counter="sizeLabel"]').textContent = t('counter.size');
    requireElement('[data-counter="zoomLabel"]').textContent = t('counter.zoom');
    requireElement('[data-counter="lockLabel"]').textContent = t('counter.lock');
    requireElement('[data-counter="undo"]').textContent = t('counter.undo');
    requireElement('[data-counter="clear"]').textContent = t('counter.clear');
    requireElement('[data-counter="save"]').textContent = t('counter.save');
    requireElement('[data-counter="help"]').textContent = t('counter.help');
    requireElement('[data-counter="fit"]').textContent = t('counter.fit');
    requireElement('[data-counter="fit"]').title = t('counter.fit.title');
    requireElement('[data-counter="zoomIn"]').setAttribute('aria-label', t('counter.zoomIn'));
    requireElement('[data-counter="zoomOut"]').setAttribute('aria-label', t('counter.zoomOut'));
    sizeNumber.setAttribute('aria-label', t('counter.size'));
    overlay.replaceChildren(
      el('span', { text: t('counter.empty') }),
      el('span', { class: 'note', text: t('counter.empty.hint') }),
    );
    updateCount();

    /* --------------------------------------------------------------- geometry */
    const canvasSize = (): Size => ({ width: canvas.width, height: canvas.height });
    const imageSize = (): Size =>
      image === undefined
        ? { width: 1, height: 1 }
        : { width: image.naturalWidth, height: image.naturalHeight };

    /** True when an image-space point falls on the picture itself. */
    function isInsideImage(point: Point): boolean {
      const { width, height } = imageSize();
      return point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
    }

    /** Convert a pointer event to canvas coordinates, accounting for CSS scaling. */
    function toCanvasPoint(event: PointerEvent | WheelEvent): Point {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height),
      };
    }

    function sizeCanvasToStage(): void {
      canvas.width = stage.clientWidth;
      canvas.height = stage.clientHeight;
    }

    function draw(): void {
      if (image === undefined) return;
      drawView(
        context,
        Object.assign(image, { width: image.naturalWidth, height: image.naturalHeight }),
        markers,
        viewport,
        canvasSize(),
      );
    }

    function updateCount(): void {
      countBadge.textContent = plural('counter.markers', markers.length);
    }

    function fail(message: string): void {
      errorMessage.textContent = message;
    }

    /* ------------------------------------------------------------ image input */

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      /* Clear the input so choosing the same file twice still fires a change. */
      fileInput.value = '';
      if (file === undefined) return;

      errorMessage.textContent = '';

      if (!file.type.startsWith('image/')) {
        fail(t('counter.notAnImage'));
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        fail(t('counter.tooLarge', { limit: Math.round(MAX_IMAGE_BYTES / 1024 / 1024) }));
        return;
      }

      loadImage(file);
    });

    function loadImage(file: File): void {
      /* Release the previous picture's memory before allocating the next. */
      if (imageUrl !== undefined) URL.revokeObjectURL(imageUrl);

      const url = URL.createObjectURL(file);
      imageUrl = url;

      const next = new Image();
      next.decoding = 'async';
      next.addEventListener(
        'load',
        () => {
          image = next;
          markers = [];
          interaction = { kind: 'idle' };
          pointers.clear();

          canvas.hidden = false;
          overlay.hidden = true;
          sizeCanvasToStage();
          viewport = fitViewport(canvasSize(), imageSize());
          updateCount();
          draw();
        },
        { once: true },
      );
      next.addEventListener(
        'error',
        () => {
          /* The browser rejected the bytes — a renamed non-image, or a format it
             does not support. The MIME check above cannot catch either. */
          URL.revokeObjectURL(url);
          if (imageUrl === url) imageUrl = undefined;
          fail(t('counter.failed'));
        },
        { once: true },
      );
      next.src = url;
    }

    /* ------------------------------------------------------------ interaction */

    canvas.addEventListener('pointerdown', (event) => {
      if (image === undefined) return;
      const point = toCanvasPoint(event);
      pointers.set(event.pointerId, {
        client: { x: event.clientX, y: event.clientY },
        canvas: point,
        type: event.pointerType,
      });

      /* Two touches means pinch-zoom, and supersedes whatever the first was doing. */
      if (
        pointers.size === 2 &&
        [...pointers.values()].every((p) => p.type === 'touch') &&
        !locked
      ) {
        event.preventDefault();
        interaction = { kind: 'pinching', lastDistance: pinchDistance() };
        return;
      }
      if (pointers.size !== 1) return;

      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);

      const imagePoint = canvasToImage(viewport, point);
      const markerIndex = findMarkerAt(markers, imagePoint, viewport.zoom);
      interaction = { kind: 'pending', markerIndex, origin: point };
    });

    canvas.addEventListener('pointermove', (event) => {
      if (image === undefined) return;
      const tracked = pointers.get(event.pointerId);
      if (tracked === undefined) return;

      const point = toCanvasPoint(event);
      pointers.set(event.pointerId, {
        client: { x: event.clientX, y: event.clientY },
        canvas: point,
        type: event.pointerType,
      });

      if (interaction.kind === 'pinching') {
        event.preventDefault();
        if (pointers.size < 2) return;
        const distance = pinchDistance();
        if (interaction.lastDistance > 0 && distance > 0) {
          viewport = zoomAt(
            viewport,
            distance / interaction.lastDistance,
            pinchMidpoint(),
            canvasSize(),
            imageSize(),
          );
          draw();
        }
        interaction = { kind: 'pinching', lastDistance: distance };
        return;
      }

      if (interaction.kind === 'pending') {
        const travelled = Math.hypot(
          point.x - interaction.origin.x,
          point.y - interaction.origin.y,
        );
        if (travelled <= DRAG_THRESHOLD_PX) return;

        if (interaction.markerIndex !== -1) {
          const marker = markers[interaction.markerIndex];
          if (marker === undefined) return;
          const imagePoint = canvasToImage(viewport, interaction.origin);
          interaction = {
            kind: 'draggingMarker',
            markerIndex: interaction.markerIndex,
            grabOffset: { x: imagePoint.x - marker.x, y: imagePoint.y - marker.y },
          };
        } else if (!locked) {
          interaction = { kind: 'panning', origin: interaction.origin, startViewport: viewport };
        } else {
          return;
        }
      }

      if (interaction.kind === 'draggingMarker') {
        event.preventDefault();
        const imagePoint = canvasToImage(viewport, point);
        markers = moveMarker(markers, interaction.markerIndex, {
          x: imagePoint.x - interaction.grabOffset.x,
          y: imagePoint.y - interaction.grabOffset.y,
        });
        draw();
      } else if (interaction.kind === 'panning') {
        event.preventDefault();
        viewport = clampViewport(
          {
            zoom: interaction.startViewport.zoom,
            offsetX:
              interaction.startViewport.offsetX - (point.x - interaction.origin.x) / viewport.zoom,
            offsetY:
              interaction.startViewport.offsetY - (point.y - interaction.origin.y) / viewport.zoom,
          },
          canvasSize(),
          imageSize(),
        );
        draw();
      }
    });

    function endPointer(event: PointerEvent): void {
      if (image === undefined) return;
      pointers.delete(event.pointerId);

      /* A press that never became a drag is a tap: place a marker. */
      if (interaction.kind === 'pending' && interaction.markerIndex === -1 && pointers.size === 0) {
        const at = canvasToImage(viewport, interaction.origin);
        /* Ignore taps on the empty space beside the image. Whenever the image is
           smaller than the view it sits centred with margins, and a marker
           dropped in a margin has coordinates outside the picture — so it would
           be counted on screen but be missing from the saved PNG. */
        if (isInsideImage(at)) {
          markers = addMarker(markers, at, color, markerSize);
          updateCount();
          draw();
        }
      }

      if (pointers.size === 0) interaction = { kind: 'idle' };
      else if (interaction.kind === 'pinching' && pointers.size < 2) interaction = { kind: 'idle' };
    }

    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    function pinchDistance(): number {
      const [first, second] = [...pointers.values()];
      if (first === undefined || second === undefined) return 0;
      return Math.hypot(second.client.x - first.client.x, second.client.y - first.client.y);
    }

    function pinchMidpoint(): Point {
      const [first, second] = [...pointers.values()];
      if (first === undefined || second === undefined) return { x: 0, y: 0 };
      return {
        x: (first.canvas.x + second.canvas.x) / 2,
        y: (first.canvas.y + second.canvas.y) / 2,
      };
    }

    canvas.addEventListener(
      'wheel',
      (event) => {
        if (image === undefined || locked) return;
        event.preventDefault();
        viewport = zoomAt(
          viewport,
          event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP,
          toCanvasPoint(event),
          canvasSize(),
          imageSize(),
        );
        draw();
      },
      { passive: false },
    );

    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    /* -------------------------------------------------------------- toolbar */

    function zoomFromButton(factor: number): void {
      if (image === undefined) return;
      viewport = zoomAt(
        viewport,
        factor,
        { x: canvas.width / 2, y: canvas.height / 2 },
        canvasSize(),
        imageSize(),
      );
      draw();
    }

    requireElement('[data-counter="zoomIn"]').addEventListener('click', () => {
      zoomFromButton(ZOOM_STEP);
    });
    requireElement('[data-counter="zoomOut"]').addEventListener('click', () => {
      zoomFromButton(1 / ZOOM_STEP);
    });
    requireElement('[data-counter="fit"]').addEventListener('click', () => {
      if (image === undefined) return;
      viewport = fitViewport(canvasSize(), imageSize());
      draw();
    });

    requireElement('[data-counter="undo"]').addEventListener('click', () => {
      if (markers.length === 0) return;
      markers = undoLast(markers);
      updateCount();
      draw();
    });

    requireElement('[data-counter="clear"]').addEventListener('click', () => {
      if (markers.length === 0) return;
      void confirmDialog({
        message: t('counter.confirmClear'),
        confirmLabel: t('counter.clear'),
        destructive: true,
      }).then((confirmed) => {
        if (!confirmed) return;
        markers = [];
        updateCount();
        draw();
      });
    });

    requireElement('[data-counter="save"]').addEventListener('click', () => {
      if (image === undefined) return;
      const exported = renderForExport(
        Object.assign(image, { width: image.naturalWidth, height: image.naturalHeight }),
        markers,
      );

      /* `toBlob` rather than `toDataURL`: no base64 copy of the whole image in
         memory, and the download URL stays a `blob:` the CSP already allows. */
      exported.toBlob((blob) => {
        if (blob === null) {
          fail(t('counter.failed'));
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = exportFileName(toIsoDate(new Date()), markers.length);
        link.rel = 'noopener';
        link.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 0);
      }, 'image/png');
    });

    colorInput.addEventListener('input', () => {
      color = colorInput.value;
    });

    function applySize(value: number): void {
      markerSize = clamp(Math.round(value), MIN_MARKER_SIZE, MAX_MARKER_SIZE);
      sizeSlider.value = String(markerSize);
      sizeNumber.value = String(markerSize);
    }

    sizeSlider.addEventListener('input', () => {
      applySize(Number(sizeSlider.value));
    });
    sizeNumber.addEventListener('change', () => {
      const parsed = Number(sizeNumber.value);
      applySize(Number.isFinite(parsed) ? parsed : markerSize);
    });

    lockCheckbox.addEventListener('change', () => {
      locked = lockCheckbox.checked;
      stage.toggleAttribute('data-locked', locked);
      interaction = { kind: 'idle' };
    });

    /* --------------------------------------------------------------- resize */

    /* `ResizeObserver` rather than a window resize listener: the stage also
       changes size when the toolbar wraps onto another line, which a window
       event does not report. */
    let previousCanvas: Size = { width: 0, height: 0 };
    const observer = new ResizeObserver(() => {
      if (image === undefined) return;
      if (stage.clientWidth === 0 || stage.clientHeight === 0) return;

      previousCanvas = canvasSize();
      sizeCanvasToStage();
      viewport = resizeViewport(viewport, previousCanvas, canvasSize(), imageSize());
      draw();
    });
    observer.observe(stage);

    window.addEventListener('pagehide', () => {
      if (imageUrl !== undefined) URL.revokeObjectURL(imageUrl);
    });
  },
});
