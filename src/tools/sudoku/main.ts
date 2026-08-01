import '../../styles/app.css';
import './sudoku.css';

import { el, queryAll, requireElement } from '../../core/dom.js';
import { formatStopwatch, formatTimestamp } from '../../core/format.js';
import { clamp } from '../../core/math.js';
import { trustedWorkerUrl } from '../../core/trusted-types.js';
import { intlTag, plural, t, type TranslationKey } from '../../i18n/index.js';
import { boot } from '../../shell/boot.js';
import { icon } from '../../shell/icons.js';
import { confirmDialog } from '../../shell/dialog.js';
import generatorWorkerUrl from './generator.worker.ts?worker&url';
import {
  BOX_SIZE,
  CELL_COUNT,
  columnOf,
  DIGITS,
  GRID_SIZE,
  indexOf,
  mostConstrainedCell,
  rowOf,
} from './board.js';
import { Game } from './game.js';
import { solve } from './generator.js';
import type { GenerateRequest, GenerateResponse } from './generator.worker.js';
import { EXPERT_PUZZLES } from './puzzles.js';
import {
  addBestTime,
  addSave,
  createBestTimeStore,
  createInstantValidationStore,
  createSavedGameStore,
  DIFFICULTIES,
  removeSave,
  type Difficulty,
  type SavedGame,
} from './persistence.js';

const DIFFICULTY_LABELS: Readonly<Record<Difficulty, TranslationKey>> = {
  easy: 'sudoku.difficulty.easy',
  medium: 'sudoku.difficulty.medium',
  hard: 'sudoku.difficulty.hard',
  expert: 'sudoku.difficulty.expert',
};

boot({
  start() {
    const game = new Game();
    const saveStore = createSavedGameStore();
    const bestTimeStore = createBestTimeStore();
    const validationStore = createInstantValidationStore();

    let difficulty: Difficulty = 'medium';
    let selected: number | undefined;
    let paused = false;
    let won = false;
    let seconds = 0;
    let timerHandle: number | undefined;
    let messageTimer: number | undefined;
    let instantValidation = validationStore.read();
    let pendingRequestId = 0;
    let lastExpertIndex = -1;
    /**
     * The solved grid for the puzzle in play, or `undefined` until it is needed.
     *
     * The generator worker already computes one, so a generated puzzle costs
     * nothing here. A saved game or an expert board is solved on demand, the
     * first time a hint is asked for — which is a few milliseconds, and paying
     * it up front on every load would be a few milliseconds nobody asked for.
     */
    let solution: readonly number[] | undefined;

    /* ---------------------------------------------------------------- elements */
    const gridHost = requireElement('[data-sudoku="grid"]');
    const wrapper = requireElement('[data-sudoku="wrapper"]');
    const radialHost = requireElement('[data-sudoku="radial"]');
    const radialOverlay = requireElement('[data-sudoku="radialOverlay"]');
    const timerLabel = requireElement('[data-sudoku="timer"]');
    const pauseButton = requireElement<HTMLButtonElement>('[data-sudoku="pause"]');
    const messageArea = requireElement('[data-sudoku="message"]');
    const difficultySelect = requireElement<HTMLSelectElement>('#sudoku-difficulty');
    const newButton = requireElement<HTMLButtonElement>('[data-sudoku="new"]');
    const saveButton = requireElement<HTMLButtonElement>('[data-sudoku="save"]');
    const loadButton = requireElement<HTMLButtonElement>('[data-sudoku="load"]');
    const undoButton = requireElement<HTMLButtonElement>('[data-sudoku="undo"]');
    const validationButton = requireElement<HTMLButtonElement>('[data-sudoku="validation"]');
    const hintButton = requireElement<HTMLButtonElement>('[data-sudoku="hint"]');
    const notesButton = requireElement<HTMLButtonElement>('[data-sudoku="notes"]');

    /* ------------------------------------------------------------------ chrome */
    document.title = `${t('tool.sudoku.name')} · ${t('app.name')}`;
    requireElement('[data-sudoku="title"]').textContent = t('tool.sudoku.name');
    requireElement('[data-sudoku="difficultyLabel"]').textContent = t('sudoku.difficulty');
    requireElement('[data-sudoku="pausedOverlay"]').textContent = t('sudoku.paused');
    requireElement('[data-sudoku="radialHint"]').textContent = t('sudoku.radialHint');
    requireElement('[data-sudoku="kbHint"]').textContent = t('sudoku.kbHint');
    newButton.textContent = t('sudoku.newGame');
    saveButton.textContent = t('sudoku.save');
    loadButton.textContent = t('common.load');
    requireElement('[data-sudoku="best"]').textContent = t('sudoku.bestTimes');
    requireElement('[data-sudoku="reset"]').textContent = t('sudoku.reset');
    undoButton.textContent = t('sudoku.undo');
    requireElement('[data-sudoku="check"]').textContent = t('sudoku.check');
    hintButton.textContent = t('sudoku.hint');
    notesButton.textContent = t('sudoku.autoNotes');
    notesButton.title = t('sudoku.autoNotes.title');
    /* An icon, so the label lives in the title and the accessible name instead. */
    validationButton.replaceChildren(icon('eye'));
    validationButton.title = t('sudoku.instantValidation');
    validationButton.setAttribute('aria-label', t('sudoku.instantValidation'));

    difficultySelect.replaceChildren(
      ...DIFFICULTIES.map((level) =>
        el('option', {
          attrs: { value: level, selected: level === difficulty },
          text: t(DIFFICULTY_LABELS[level]),
        }),
      ),
    );

    /* ------------------------------------------------------------------ worker */

    /*
     * A real module worker, bundled to its own same-origin file.
     *
     * The URL is imported with `?worker&url` rather than written as
     * `new Worker(new URL('./generator.worker.ts', import.meta.url))`. Both make
     * Vite bundle the worker, but only the import leaves us in control of the
     * `Worker` call itself — and that call has to go through the Trusted Types
     * policy, because the constructor is a Trusted Types sink. Passing the `new
     * URL(...)` form to a wrapper function also defeats Vite's static detection
     * of the pattern, which silently downgrades the worker to a copied `.ts`
     * asset that the browser then refuses to execute.
     */
    const worker = new Worker(trustedWorkerUrl(new URL(generatorWorkerUrl, window.location.href)), {
      type: 'module',
    });

    worker.addEventListener('message', (event: MessageEvent<GenerateResponse>) => {
      const response = event.data;
      /* Ignore a reply to a request that has since been superseded. */
      if (response.id !== pendingRequestId) return;

      newButton.disabled = false;
      difficultySelect.disabled = false;

      if (!response.ok) {
        say(t('sudoku.generateFailed'), false);
        return;
      }
      /* The worker solved the grid on its way to carving the puzzle out of it,
         so hints on a generated board never need a solve on the main thread. */
      startPuzzle(response.puzzle, undefined, response.solution);
      say('');
    });

    worker.addEventListener('error', () => {
      newButton.disabled = false;
      difficultySelect.disabled = false;
      say(t('sudoku.generateFailed'), false);
    });

    /* ------------------------------------------------------------------- grid */

    const cells: HTMLButtonElement[] = [];
    const cellValues: HTMLElement[] = [];
    const cellNotes: HTMLElement[][] = [];

    /**
     * The nine `role="row"` containers the grid needs.
     *
     * `role="grid"` may only contain rows, and `role="gridcell"` may only sit
     * inside one. Appending all 81 cells straight to the grid — which is what
     * this did — is an invalid structure that leaves a screen reader with no
     * defined way to walk the board, and it is what the accessibility sweep
     * caught.
     *
     * The rows carry `display: contents` so the nine-column CSS grid still lays
     * the cells out directly; the wrappers exist for the accessibility tree and
     * change nothing visually. Browsers used to drop `display: contents`
     * elements out of that tree, which would have made this pointless, but that
     * bug was fixed across Chrome, Firefox and Safari years before this code.
     */
    function buildRows(): HTMLElement[] {
      return Array.from({ length: GRID_SIZE }, (_, row) =>
        el('div', {
          class: 'sudoku-row',
          attrs: { role: 'row', 'aria-rowindex': row + 1 },
        }),
      );
    }

    function buildGrid(): void {
      const rows = buildRows();
      for (const row of rows) gridHost.append(row);

      for (let index = 0; index < CELL_COUNT; index++) {
        const row = rowOf(index);
        const column = columnOf(index);

        const value = el('span', { class: 'sudoku-cell__value' });
        const notes = DIGITS.map((digit) =>
          el('span', { class: 'sudoku-cell__note', text: digit }),
        );

        const cell = el('button', {
          class: 'sudoku-cell',
          attrs: {
            type: 'button',
            role: 'gridcell',
            'aria-colindex': column + 1,
            'aria-label': t('sudoku.cell', { row: row + 1, col: column + 1 }),
            /* Only the focused cell is tabbable; arrows move within the grid.
               This is the standard roving-tabindex pattern for a grid widget. */
            tabindex: -1,
            'data-box-right': column % BOX_SIZE === BOX_SIZE - 1 && column !== GRID_SIZE - 1,
            'data-box-bottom': row % BOX_SIZE === BOX_SIZE - 1 && row !== GRID_SIZE - 1,
          },
          data: { index },
          on: {
            click: (event) => {
              if (paused || won) return;
              select(index);

              /* Givens cannot be changed, so there is nothing to pick for them.
                 Selecting one is still useful: it highlights the same digit
                 elsewhere on the board. */
              if (game.isGiven(index)) {
                hideRadial();
                return;
              }

              /* `detail === 0` means the click came from the keyboard activating
                 the button, which carries no coordinates to anchor a ring to.
                 Those users type the digit directly instead. */
              if (event.detail === 0) return;

              /* Only a gesture that started on this cell may open the ring. */
              if (gestureStartedOnCell !== index) return;

              showRadial(event.clientX, event.clientY, index);
            },
          },
        });
        cell.append(el('span', { class: 'sudoku-cell__notes' }, ...notes), value);

        cells.push(cell);
        cellValues.push(value);
        cellNotes.push(notes);
        rows[row]?.append(cell);
      }
    }

    /* ----------------------------------------------------------- radial picker
     *
     * The digits appear in a ring centred on the cell that was tapped, so the
     * finger never leaves the board. Holding a digit rather than tapping it
     * pencils in a note, which means notes need no separate mode switch — one
     * gesture covers both, and that is the whole point of the design.
     */

    /** Ring diameter in pixels. Items are laid out inside this box. */
    const RADIAL_DIAMETER = 180;

    /** Inset of the digit centres from the ring's edge. */
    const RADIAL_ITEM_INSET = 25;

    /** Hold this long and the digit becomes a note instead of an answer. */
    const NOTE_HOLD_MS = 400;

    /**
     * The cell a pointer gesture started on, or `undefined` if it started
     * anywhere else.
     *
     * This is what stops the picker reopening the instant it closes. Releasing a
     * digit hides the ring, and the browser then emits a compatibility `click`
     * for the same gesture — on touch it does so by hit-testing the coordinates
     * *after* the ring has gone, so the click lands on whatever is underneath.
     * For the erase button at the centre that is precisely the cell that opened
     * the ring, which promptly reopened it.
     *
     * Requiring the gesture to have *begun* on the cell rejects those synthesised
     * clicks by construction, whatever route they arrive by, while a genuine tap
     * always qualifies. It replaces a timing window, which could only ever be
     * both too short to be reliable and long enough to swallow a fast second tap.
     */
    let gestureStartedOnCell: number | undefined;

    document.addEventListener(
      'pointerdown',
      (event) => {
        const origin =
          event.target instanceof Element ? event.target.closest('.sudoku-cell') : null;
        gestureStartedOnCell =
          origin instanceof HTMLElement ? Number(origin.dataset['index']) : undefined;
      },
      /* Capture, so this runs before any handler that might stop propagation. */
      true,
    );

    /** Keep the ring this far from the viewport edge. */
    const RADIAL_EDGE_PADDING = 10;

    /** Index of the cell the ring is currently acting on, if it is open. */
    let radialTarget: number | undefined;
    let holdTimer: number | undefined;
    let holdBecameNote = false;

    function buildRadial(): void {
      const centre = RADIAL_DIAMETER / 2;
      const radius = centre - RADIAL_ITEM_INSET;

      const item = (digit: number): HTMLElement =>
        el('button', {
          class: 'sudoku-radial__item',
          attrs: {
            type: 'button',
            role: 'menuitem',
            'aria-label': digit === 0 ? t('sudoku.erase') : String(digit),
            /* The ring is driven by pointer gestures and dismissed on blur; the
               items stay out of the tab order so a keyboard user is never parked
               inside it. Keyboard entry is direct digit presses. */
            tabindex: -1,
          },
          data: { digit },
          text: digit === 0 ? '⌫' : String(digit),
        });

      const items = DIGITS.map((digit) => {
        /* Start at twelve o'clock and step 40° per digit, so 1-9 read clockwise. */
        const angle = ((digit - 1) * 40 - 90) * (Math.PI / 180);
        const node = item(digit);
        node.style.setProperty('--x', `${String(Math.cos(angle) * radius + centre)}px`);
        node.style.setProperty('--y', `${String(Math.sin(angle) * radius + centre)}px`);
        return node;
      });

      /* Erase sits in the middle, where the thumb already is. */
      const erase = item(0);
      erase.style.setProperty('--x', `${String(centre)}px`);
      erase.style.setProperty('--y', `${String(centre)}px`);

      radialHost.replaceChildren(...items, erase);
      radialHost.setAttribute('aria-label', t('sudoku.picker'));
    }

    function showRadial(clientX: number, clientY: number, index: number): void {
      /* Nudge the ring back inside the viewport so no digit lands off-screen. */
      const radius = RADIAL_DIAMETER / 2;
      const limit = radius + RADIAL_EDGE_PADDING;
      const x = clamp(clientX, limit, Math.max(limit, window.innerWidth - limit));
      const y = clamp(clientY, limit, Math.max(limit, window.innerHeight - limit));

      radialHost.style.setProperty('--left', `${String(x)}px`);
      radialHost.style.setProperty('--top', `${String(y)}px`);
      radialHost.hidden = false;
      radialOverlay.hidden = false;
      radialTarget = index;
      render();
    }

    function hideRadial(): void {
      if (radialTarget === undefined) return;
      clearHold();
      radialHost.hidden = true;
      radialOverlay.hidden = true;
      radialTarget = undefined;
      render();
    }

    function clearHold(): void {
      window.clearTimeout(holdTimer);
      holdTimer = undefined;
      holdBecameNote = false;
      for (const node of queryAll('[data-holding]', radialHost)) {
        node.removeAttribute('data-holding');
      }
    }

    function digitOf(target: EventTarget | null): { node: HTMLElement; digit: number } | undefined {
      if (!(target instanceof Element)) return undefined;
      const node = target.closest<HTMLElement>('.sudoku-radial__item');
      if (node === null) return undefined;
      const digit = Number(node.dataset['digit']);
      return Number.isInteger(digit) ? { node, digit } : undefined;
    }

    radialHost.addEventListener('pointerdown', (event) => {
      const found = digitOf(event.target);
      if (found === undefined) return;
      event.preventDefault();
      /* Capture, so the matching pointerup arrives here even if the finger
         drifts off the digit while holding. */
      found.node.setPointerCapture(event.pointerId);

      clearHold();
      holdTimer = window.setTimeout(() => {
        holdBecameNote = true;
        found.node.setAttribute('data-holding', '');
      }, NOTE_HOLD_MS);
    });

    radialHost.addEventListener('pointerup', (event) => {
      const found = digitOf(event.target);
      if (found === undefined || radialTarget === undefined) return;
      event.preventDefault();

      const index = radialTarget;
      const asNote = holdBecameNote;
      clearHold();

      if (found.digit === 0) {
        if (game.erase(index)) render();
      } else if (asNote) {
        if (game.toggleNote(index, found.digit)) render();
      } else {
        enter(found.digit, index);
      }
      hideRadial();
    });

    radialHost.addEventListener('pointercancel', clearHold);
    radialOverlay.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      hideRadial();
    });

    /* --------------------------------------------------------------- rendering */

    function render(): void {
      const conflicts = instantValidation ? game.conflicts() : new Set<number>();
      const selectedValue = selected === undefined ? 0 : game.valueAt(selected);

      for (let index = 0; index < CELL_COUNT; index++) {
        const cell = cells[index];
        const valueNode = cellValues[index];
        const notes = cellNotes[index];
        if (cell === undefined || valueNode === undefined || notes === undefined) continue;

        const value = game.valueAt(index);
        valueNode.textContent = value === 0 ? '' : String(value);

        const pencilled = game.notesAt(index);
        for (const [position, noteNode] of notes.entries()) {
          noteNode.toggleAttribute('data-on', value === 0 && pencilled.has(position + 1));
        }

        cell.toggleAttribute('data-given', game.isGiven(index));
        /* Only while the digit is actually there: undoing a hint should take the
           mark with it. */
        cell.toggleAttribute('data-hint', value !== 0 && game.isRevealed(index));
        cell.toggleAttribute('data-conflict', conflicts.has(index));
        cell.toggleAttribute('data-selected', index === selected);
        cell.toggleAttribute('data-picking', index === radialTarget);
        cell.toggleAttribute('data-peer', selected !== undefined && isPeer(selected, index));
        cell.toggleAttribute(
          'data-same-digit',
          selectedValue !== 0 && value === selectedValue && index !== selected,
        );
        cell.tabIndex = index === (selected ?? 0) ? 0 : -1;
      }

      undoButton.disabled = !game.canUndo;
      validationButton.setAttribute('aria-pressed', String(instantValidation));
    }

    /** True when two cells share a row, column or box. */
    function isPeer(a: number, b: number): boolean {
      if (a === b) return false;
      if (rowOf(a) === rowOf(b) || columnOf(a) === columnOf(b)) return true;
      return (
        Math.floor(rowOf(a) / BOX_SIZE) === Math.floor(rowOf(b) / BOX_SIZE) &&
        Math.floor(columnOf(a) / BOX_SIZE) === Math.floor(columnOf(b) / BOX_SIZE)
      );
    }

    function select(index: number): void {
      selected = index;
      render();
      cells[index]?.focus();
    }

    function say(message: string, success = true): void {
      window.clearTimeout(messageTimer);
      messageArea.textContent = message;
      messageArea.className = message === '' ? 'msg' : `msg ${success ? 'msg--ok' : 'msg--err'}`;
      if (message !== '') {
        messageTimer = window.setTimeout(() => {
          messageArea.textContent = '';
        }, 4000);
      }
    }

    /* ------------------------------------------------------------------ moves */

    function enter(digit: number, index = selected): void {
      if (index === undefined || paused || won) return;
      if (!game.place(index, digit)) return;
      render();
      checkForWin();
    }

    function eraseSelected(): void {
      if (selected === undefined || paused || won) return;
      if (game.erase(selected)) render();
    }

    /**
     * Reveal one correct digit.
     *
     * It lands on the selected cell when that cell is empty, and otherwise on
     * the most constrained empty cell on the board — the one a player would have
     * found next anyway, rather than an arbitrary one in reading order.
     */
    function giveHint(): void {
      if (paused || won) return;

      const answer = solutionFor();
      if (answer === undefined) {
        say(t('sudoku.hint.unavailable'), false);
        return;
      }

      const target =
        selected !== undefined && game.valueAt(selected) === 0
          ? selected
          : mostConstrainedCell(game.board);
      if (target === undefined) {
        say(t('sudoku.hint.complete'), false);
        return;
      }

      const digit = answer[target] ?? 0;
      if (!game.reveal(target, digit)) return;

      select(target);
      say(t('sudoku.hint.given', { row: rowOf(target) + 1, col: columnOf(target) + 1 }));
      checkForWin();
    }

    /** The solved grid, solved on demand and remembered for the rest of the game. */
    function solutionFor(): readonly number[] | undefined {
      /* Solved from the *givens*, never from the board as it stands: a board
         carrying one of the player's mistakes has no solution at all, and a hint
         is exactly what someone in that position is reaching for. */
      solution ??= solve([...game.givens]);
      return solution;
    }

    function fillNotes(): void {
      if (paused || won) return;

      const filled = game.autoNotes();
      render();
      say(
        filled === 0 ? t('sudoku.autoNotes.none') : plural('sudoku.autoNotes.done', filled),
        filled > 0,
      );
    }

    function checkForWin(): void {
      if (!game.isSolved()) return;
      won = true;
      stopTimer();
      pauseButton.disabled = true;
      saveButton.disabled = true;
      wrapper.setAttribute('data-won', '');
      void showWinDialog();
    }

    /* ------------------------------------------------------------------ timer */

    function startTimer(from = 0): void {
      stopTimer();
      seconds = from;
      updateTimer();
      pauseButton.disabled = false;
      resumeTimer();
    }

    function resumeTimer(): void {
      if (timerHandle !== undefined || paused || won) return;
      timerHandle = window.setInterval(() => {
        seconds++;
        updateTimer();
      }, 1000);
    }

    function stopTimer(): void {
      window.clearInterval(timerHandle);
      timerHandle = undefined;
    }

    function updateTimer(): void {
      timerLabel.textContent = formatStopwatch(seconds);
    }

    function setPaused(next: boolean): void {
      if (won) return;
      paused = next;
      wrapper.toggleAttribute('data-paused', paused);
      pauseButton.replaceChildren(icon(paused ? 'play' : 'pause'));
      pauseButton.setAttribute('aria-label', paused ? t('sudoku.resume') : t('sudoku.pause'));
      if (paused) stopTimer();
      else resumeTimer();
    }

    /* ------------------------------------------------------------- new games */

    function startPuzzle(
      puzzle: readonly number[],
      resumeFrom?: SavedGame,
      knownSolution?: readonly number[],
    ): void {
      won = false;
      wrapper.removeAttribute('data-won');
      setPaused(false);
      saveButton.disabled = false;
      solution = knownSolution;

      if (resumeFrom === undefined) {
        game.reset(puzzle);
        startTimer(0);
      } else {
        game.reset(resumeFrom.initialBoard, resumeFrom.currentBoard, resumeFrom.notes, {
          revealed: resumeFrom.revealed,
          hints: resumeFrom.hints,
        });
        startTimer(resumeFrom.seconds);
      }

      selected = firstEmptyCell();
      render();
    }

    function firstEmptyCell(): number {
      for (let index = 0; index < CELL_COUNT; index++) {
        if (!game.isGiven(index)) return index;
      }
      return 0;
    }

    function newGame(): void {
      difficulty = asDifficulty(difficultySelect.value);

      if (difficulty === 'expert') {
        /* Avoid handing out the same board twice in a row. */
        let index = Math.floor(Math.random() * EXPERT_PUZZLES.length);
        if (EXPERT_PUZZLES.length > 1 && index === lastExpertIndex) {
          index = (index + 1) % EXPERT_PUZZLES.length;
        }
        lastExpertIndex = index;
        const puzzle = EXPERT_PUZZLES[index];
        if (puzzle !== undefined) startPuzzle(puzzle);
        return;
      }

      say(t('sudoku.generating'));
      newButton.disabled = true;
      difficultySelect.disabled = true;
      pendingRequestId++;
      const request: GenerateRequest = { id: pendingRequestId, difficulty };
      worker.postMessage(request);
    }

    function asDifficulty(value: string): Difficulty {
      return (DIFFICULTIES as readonly string[]).includes(value) ? (value as Difficulty) : 'medium';
    }

    /* --------------------------------------------------------------- dialogs */

    async function showWinDialog(): Promise<void> {
      /*
       * A solve that leaned on hints is congratulated but not ranked. A best
       * times list that mixes the two would mean nothing, and quietly recording
       * an assisted time would be the more annoying of the two surprises.
       */
      if (game.hintsUsed > 0) {
        say(
          plural('sudoku.win.assisted', game.hintsUsed, { time: formatStopwatch(seconds) }),
          false,
        );
        return;
      }

      const save = await confirmDialog({
        message: `${t('sudoku.win.solvedIn', { time: formatStopwatch(seconds) })} ${t('sudoku.win.question')}`,
        confirmLabel: t('common.yes'),
        cancelLabel: t('common.no'),
      });

      if (save) {
        const times = addBestTime(bestTimeStore.read(), difficulty, {
          seconds,
          board: [...game.givens],
          achievedAt: Date.now(),
        });
        bestTimeStore.write(times);
      }
      say(t('sudoku.win.message'));
    }

    function openDialog(title: string, body: HTMLElement): HTMLDialogElement {
      const dialog = el(
        'dialog',
        {},
        el('h2', { text: title }),
        body,
        el(
          'div',
          { class: 'dialog__actions' },
          el('button', {
            class: ['btn', 'btn--primary'],
            attrs: { type: 'button' },
            text: t('common.close'),
            on: {
              click: () => {
                dialog.close();
              },
            },
          }),
        ),
      );
      dialog.addEventListener('close', () => {
        dialog.remove();
      });
      document.body.append(dialog);
      dialog.showModal();
      return dialog;
    }

    function showSavedGames(): void {
      const body = el('div', {});
      const dialog = openDialog(t('sudoku.savedGames.title'), body);

      const renderList = (): void => {
        const saves = saveStore.read();
        if (saves.length === 0) {
          body.replaceChildren(el('p', { class: 'empty', text: t('sudoku.savedGames.empty') }));
          return;
        }
        body.replaceChildren(
          el(
            'ul',
            { class: 'sudoku-save-list' },
            ...saves.map((save) =>
              el(
                'li',
                {},
                el(
                  'span',
                  { class: 'sudoku-save-info' },
                  el('strong', { text: formatTimestamp(save.savedAt, intlTag()) }),
                  el('span', {
                    text: `${t(DIFFICULTY_LABELS[save.difficulty])} · ${formatStopwatch(save.seconds)}`,
                  }),
                ),
                el(
                  'span',
                  { class: 'cluster' },
                  el('button', {
                    class: ['btn', 'btn--primary'],
                    attrs: { type: 'button' },
                    text: t('common.load'),
                    on: {
                      click: () => {
                        difficulty = save.difficulty;
                        difficultySelect.value = save.difficulty;
                        startPuzzle(save.initialBoard, save);
                        dialog.close();
                        say(t('sudoku.loaded'));
                      },
                    },
                  }),
                  el('button', {
                    class: ['btn', 'btn--danger'],
                    attrs: { type: 'button' },
                    text: t('common.delete'),
                    on: {
                      click: () => {
                        saveStore.write(removeSave(saveStore.read(), save.id));
                        renderList();
                        updateLoadButton();
                      },
                    },
                  }),
                ),
              ),
            ),
          ),
        );
      };

      renderList();
    }

    function showBestTimes(): void {
      const times = bestTimeStore.read();
      const body = el('div', {});
      const dialog = openDialog(t('sudoku.bestTimes'), body);

      body.replaceChildren(
        ...DIFFICULTIES.map((level) => {
          const entries = times[level];
          return el(
            'section',
            { class: 'sudoku-dialog-section' },
            el('h3', { text: t(DIFFICULTY_LABELS[level]) }),
            entries.length === 0
              ? el('p', { class: 'note', text: t('sudoku.bestTimes.empty') })
              : el(
                  'ol',
                  { class: 'sudoku-best-list' },
                  ...entries.map((entry) =>
                    el(
                      'li',
                      {},
                      el('span', { class: 'numeric', text: formatStopwatch(entry.seconds) }),
                      el('button', {
                        class: 'btn',
                        attrs: { type: 'button' },
                        text: t('sudoku.play'),
                        on: {
                          click: () => {
                            difficulty = level;
                            difficultySelect.value = level;
                            startPuzzle(entry.board);
                            dialog.close();
                          },
                        },
                      }),
                    ),
                  ),
                ),
          );
        }),
      );
    }

    function updateLoadButton(): void {
      loadButton.disabled = saveStore.read().length === 0;
    }

    /* ---------------------------------------------------------------- wiring */

    newButton.addEventListener('click', newGame);
    pauseButton.addEventListener('click', () => {
      setPaused(!paused);
    });

    saveButton.addEventListener('click', () => {
      const snapshot = game.snapshot();
      const saved: SavedGame = {
        id: Date.now(),
        savedAt: Date.now(),
        difficulty,
        seconds,
        initialBoard: snapshot.initial,
        currentBoard: snapshot.current,
        notes: snapshot.notes,
        revealed: snapshot.revealed,
        hints: snapshot.hints,
      };
      const result = saveStore.write(addSave(saveStore.read(), saved));
      say(
        result.ok
          ? t('sudoku.saved')
          : result.error.kind === 'quota-exceeded'
            ? t('storage.full')
            : t('storage.failed'),
        result.ok,
      );
      updateLoadButton();
    });

    loadButton.addEventListener('click', showSavedGames);
    requireElement('[data-sudoku="best"]').addEventListener('click', showBestTimes);

    requireElement('[data-sudoku="reset"]').addEventListener('click', () => {
      void confirmDialog({
        message: t('sudoku.reset'),
        confirmLabel: t('sudoku.reset'),
        destructive: true,
      }).then((confirmed) => {
        if (!confirmed) return;
        game.restart();
        won = false;
        wrapper.removeAttribute('data-won');
        saveButton.disabled = false;
        startTimer(0);
        render();
      });
    });

    undoButton.addEventListener('click', () => {
      const index = game.undo();
      if (index === undefined) return;
      selected = index;
      render();
    });

    hintButton.addEventListener('click', giveHint);
    notesButton.addEventListener('click', fillNotes);

    requireElement('[data-sudoku="check"]').addEventListener('click', () => {
      const conflicts = game.conflicts();
      say(conflicts.size === 0 ? t('sudoku.correct') : t('sudoku.errors'), conflicts.size === 0);
    });

    validationButton.addEventListener('click', () => {
      instantValidation = !instantValidation;
      validationStore.write(instantValidation);
      render();
    });

    difficultySelect.addEventListener('change', () => {
      difficulty = asDifficulty(difficultySelect.value);
    });

    /* -------------------------------------------------------------- keyboard */

    document.addEventListener('keydown', (event) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (document.querySelector('dialog[open]') !== null) return;

      if (event.key === 'Escape') {
        if (radialTarget !== undefined) {
          hideRadial();
          return;
        }
        selected = undefined;
        render();
        return;
      }
      if (paused || won) return;

      const moves: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      const move = moves[event.key];
      if (move !== undefined) {
        event.preventDefault();
        if (selected === undefined) {
          select(0);
          return;
        }
        const [deltaRow, deltaColumn] = move;
        const row = (rowOf(selected) + deltaRow + GRID_SIZE) % GRID_SIZE;
        const column = (columnOf(selected) + deltaColumn + GRID_SIZE) % GRID_SIZE;
        select(indexOf(row, column));
        return;
      }

      if (selected === undefined) return;

      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
      if (digit?.[1] !== undefined) {
        event.preventDefault();
        const value = Number(digit[1]);
        /* Shift places a note, matching the hint under the board. */
        if (event.shiftKey) {
          if (game.toggleNote(selected, value)) render();
        } else {
          enter(value);
        }
        return;
      }

      if (
        event.key === 'Backspace' ||
        event.key === 'Delete' ||
        event.code === 'Digit0' ||
        event.code === 'Numpad0'
      ) {
        event.preventDefault();
        eraseSelected();
      }
    });

    /* -------------------------------------------------------------------- go */

    buildGrid();
    buildRadial();
    setPaused(false);
    updateLoadButton();
    newGame();
  },
});
