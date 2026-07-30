import '../../styles/app.css';
import './sudoku.css';

import { el, requireElement } from '../../core/dom.js';
import { formatStopwatch, formatTimestamp } from '../../core/format.js';
import { trustedWorkerUrl } from '../../core/trusted-types.js';
import { intlTag, t, type TranslationKey } from '../../i18n/index.js';
import { boot } from '../../shell/boot.js';
import { confirmDialog } from '../../shell/dialog.js';
import generatorWorkerUrl from './generator.worker.ts?worker&url';
import { BOX_SIZE, CELL_COUNT, columnOf, DIGITS, GRID_SIZE, indexOf, rowOf } from './board.js';
import { Game } from './game.js';
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
    let noteMode = false;
    let paused = false;
    let won = false;
    let seconds = 0;
    let timerHandle: number | undefined;
    let messageTimer: number | undefined;
    let instantValidation = validationStore.read();
    let pendingRequestId = 0;
    let lastExpertIndex = -1;

    /* ---------------------------------------------------------------- elements */
    const gridHost = requireElement('[data-sudoku="grid"]');
    const wrapper = requireElement('[data-sudoku="wrapper"]');
    const padHost = requireElement('[data-sudoku="pad"]');
    const timerLabel = requireElement('[data-sudoku="timer"]');
    const pauseButton = requireElement<HTMLButtonElement>('[data-sudoku="pause"]');
    const messageArea = requireElement('[data-sudoku="message"]');
    const difficultySelect = requireElement<HTMLSelectElement>('#sudoku-difficulty');
    const newButton = requireElement<HTMLButtonElement>('[data-sudoku="new"]');
    const saveButton = requireElement<HTMLButtonElement>('[data-sudoku="save"]');
    const loadButton = requireElement<HTMLButtonElement>('[data-sudoku="load"]');
    const undoButton = requireElement<HTMLButtonElement>('[data-sudoku="undo"]');
    const validationButton = requireElement<HTMLButtonElement>('[data-sudoku="validation"]');

    /* ------------------------------------------------------------------ chrome */
    document.title = `${t('tool.sudoku.name')} · ${t('app.name')}`;
    requireElement('[data-sudoku="title"]').textContent = t('tool.sudoku.name');
    requireElement('[data-sudoku="difficultyLabel"]').textContent = t('sudoku.difficulty');
    requireElement('[data-sudoku="pausedOverlay"]').textContent = t('sudoku.paused');
    requireElement('[data-sudoku="kbHint"]').textContent = t('sudoku.kbHint');
    newButton.textContent = t('sudoku.newGame');
    saveButton.textContent = t('sudoku.save');
    loadButton.textContent = t('common.load');
    requireElement('[data-sudoku="best"]').textContent = t('sudoku.bestTimes');
    requireElement('[data-sudoku="reset"]').textContent = t('sudoku.reset');
    undoButton.textContent = t('sudoku.undo');
    requireElement('[data-sudoku="check"]').textContent = t('sudoku.check');
    /* An icon, so the label lives in the title and the accessible name instead. */
    validationButton.textContent = '👁';
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
      startPuzzle(response.puzzle);
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

    function buildGrid(): void {
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
            'aria-label': t('sudoku.cell', { row: row + 1, col: column + 1 }),
            /* Only the focused cell is tabbable; arrows move within the grid.
               This is the standard roving-tabindex pattern for a grid widget. */
            tabindex: -1,
            'data-box-right': column % BOX_SIZE === BOX_SIZE - 1 && column !== GRID_SIZE - 1,
            'data-box-bottom': row % BOX_SIZE === BOX_SIZE - 1 && row !== GRID_SIZE - 1,
          },
          data: { index },
          on: {
            click: () => {
              if (paused) return;
              select(index);
            },
          },
        });
        cell.append(el('span', { class: 'sudoku-cell__notes' }, ...notes), value);

        cells.push(cell);
        cellValues.push(value);
        cellNotes.push(notes);
        gridHost.append(cell);
      }
    }

    function buildPad(): void {
      padHost.replaceChildren(
        ...DIGITS.map((digit) =>
          el('button', {
            class: 'btn',
            attrs: { type: 'button' },
            text: digit,
            on: {
              click: () => {
                enter(digit);
              },
            },
          }),
        ),
        el('button', {
          class: 'btn',
          attrs: { type: 'button', 'data-action': 'erase' },
          text: t('sudoku.erase'),
          on: {
            click: () => {
              eraseSelected();
            },
          },
        }),
        el('button', {
          class: 'btn',
          attrs: { type: 'button', 'data-action': 'notes', 'aria-pressed': 'false' },
          text: '✏️',
          on: {
            click: (event) => {
              noteMode = !noteMode;
              (event.currentTarget as HTMLElement).setAttribute('aria-pressed', String(noteMode));
            },
          },
        }),
      );
      const notesButton = padHost.querySelector('[data-action="notes"]');
      notesButton?.setAttribute('title', t('sudoku.kbHint'));
    }

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
        cell.toggleAttribute('data-conflict', conflicts.has(index));
        cell.toggleAttribute('data-selected', index === selected);
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

    function enter(digit: number): void {
      if (selected === undefined || paused || won) return;
      const changed = noteMode ? game.toggleNote(selected, digit) : game.place(selected, digit);
      if (!changed) return;
      render();
      checkForWin();
    }

    function eraseSelected(): void {
      if (selected === undefined || paused || won) return;
      if (game.erase(selected)) render();
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
      pauseButton.textContent = paused ? '▶' : '❙❙';
      pauseButton.setAttribute('aria-label', paused ? t('sudoku.resume') : t('sudoku.pause'));
      if (paused) stopTimer();
      else resumeTimer();
    }

    /* ------------------------------------------------------------- new games */

    function startPuzzle(puzzle: readonly number[], resumeFrom?: SavedGame): void {
      won = false;
      wrapper.removeAttribute('data-won');
      setPaused(false);
      saveButton.disabled = false;

      if (resumeFrom === undefined) {
        game.reset(puzzle);
        startTimer(0);
      } else {
        game.reset(resumeFrom.initialBoard, resumeFrom.currentBoard, resumeFrom.notes);
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
    buildPad();
    setPaused(false);
    updateLoadButton();
    newGame();
  },
});
