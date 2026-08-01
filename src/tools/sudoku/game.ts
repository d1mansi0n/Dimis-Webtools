/**
 * Sudoku — the mutable game state and the moves that change it.
 *
 * Separated from the DOM so undo, note toggling and win detection can be tested
 * directly. The UI owns one instance and re-renders from it.
 */

import {
  candidatesAt,
  cloneBoard,
  cloneNotes,
  emptyBoard,
  emptyNotes,
  findConflicts,
  isSolved,
  type Board,
  type Notes,
} from './board.js';

/** Enough history to undo a whole session's worth of misclicks, but bounded. */
export const MAX_HISTORY = 500;

interface CellState {
  readonly index: number;
  readonly previousValue: number;
  readonly previousNotes: readonly number[];
}

/**
 * One undoable step, which may touch more than one cell.
 *
 * Auto-notes writes into every empty cell at once. If that were recorded as
 * eighty separate moves, undoing it would mean eighty presses — so a move is a
 * set of cells rather than a single one, and Undo always steps back exactly one
 * thing the player did.
 */
interface Move {
  readonly cells: readonly CellState[];
}

export class Game {
  /** The givens. Cells that are non-zero here can never be changed. */
  private initial: Board = emptyBoard();
  private current: Board = emptyBoard();
  private pencilled: Notes = emptyNotes();
  private history: Move[] = [];

  /**
   * Cells whose digit came from a hint rather than from the player.
   *
   * Kept so the board can show which answers were given away, and so a solve
   * that leaned on them is not offered as a best time.
   */
  private revealed = new Set<number>();

  /**
   * How many hints have been taken.
   *
   * Only ever counts up: undoing a hint puts the digit back but does not unsee
   * it, so a time set afterwards is still an assisted one.
   */
  private hints = 0;

  /** Load a puzzle, discarding any game in progress. */
  reset(
    initial: readonly number[],
    current?: readonly number[],
    notes?: readonly number[][],
    /* Carried across a save and load so that reloading a game is not a way to
       launder the hints taken in it into a best time. */
    assisted?: { readonly revealed: readonly number[]; readonly hints: number },
  ): void {
    this.initial = cloneBoard(initial);
    this.current = cloneBoard(current ?? initial);
    this.pencilled = notes === undefined ? emptyNotes() : notes.map((digits) => new Set(digits));
    /* Guard against a notes array of the wrong length reaching the renderer. */
    while (this.pencilled.length < this.initial.length) this.pencilled.push(new Set());
    this.history = [];
    this.revealed = new Set(assisted?.revealed ?? []);
    this.hints = assisted?.hints ?? 0;
  }

  /** Restart the current puzzle from its givens. */
  restart(): void {
    this.reset(this.initial);
  }

  get board(): readonly number[] {
    return this.current;
  }

  get givens(): readonly number[] {
    return this.initial;
  }

  get notes(): readonly Set<number>[] {
    return this.pencilled;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  get hintsUsed(): number {
    return this.hints;
  }

  isGiven(index: number): boolean {
    return (this.initial[index] ?? 0) !== 0;
  }

  /** True when this cell's digit came from a hint rather than from the player. */
  isRevealed(index: number): boolean {
    return this.revealed.has(index);
  }

  valueAt(index: number): number {
    return this.current[index] ?? 0;
  }

  notesAt(index: number): ReadonlySet<number> {
    return this.pencilled[index] ?? new Set();
  }

  conflicts(): Set<number> {
    return findConflicts(this.current);
  }

  isSolved(): boolean {
    return isSolved(this.current);
  }

  /** Snapshot for saving. Sets are converted to plain arrays for JSON. */
  snapshot(): {
    initial: Board;
    current: Board;
    notes: number[][];
    revealed: number[];
    hints: number;
  } {
    return {
      initial: cloneBoard(this.initial),
      current: cloneBoard(this.current),
      notes: cloneNotes(this.pencilled).map((set) => [...set]),
      revealed: [...this.revealed],
      hints: this.hints,
    };
  }

  private record(...indices: readonly number[]): void {
    this.history.push({
      cells: indices.map((index) => ({
        index,
        previousValue: this.current[index] ?? 0,
        previousNotes: [...(this.pencilled[index] ?? [])],
      })),
    });
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  /**
   * Write a digit into a cell.
   *
   * Entering the digit already there clears it instead, which makes a single
   * button both "set" and "unset" — the behaviour version 2.0 had, and the
   * reason there is no separate erase step for pointer users.
   *
   * Returns whether anything changed.
   */
  place(index: number, value: number): boolean {
    if (this.isGiven(index)) return false;

    const previous = this.current[index] ?? 0;
    const next = previous === value ? 0 : value;
    const hadNotes = (this.pencilled[index]?.size ?? 0) > 0;
    if (previous === next && !hadNotes) return false;

    this.record(index);
    this.current[index] = next;
    /* A confirmed digit supersedes the pencil marks in that cell. */
    this.pencilled[index]?.clear();
    /* Typing over a hinted cell makes the answer the player's own again. */
    this.revealed.delete(index);
    return true;
  }

  /** Empty a cell, keeping its notes only if it had no digit. */
  erase(index: number): boolean {
    if (this.isGiven(index)) return false;
    const hasValue = (this.current[index] ?? 0) !== 0;
    const hasNotes = (this.pencilled[index]?.size ?? 0) > 0;
    if (!hasValue && !hasNotes) return false;

    this.record(index);
    this.current[index] = 0;
    this.pencilled[index]?.clear();
    this.revealed.delete(index);
    return true;
  }

  /**
   * Toggle a pencil mark.
   *
   * Refused while the cell holds a digit: notes are a record of what a cell
   * *might* be, which is meaningless once it is decided.
   */
  toggleNote(index: number, value: number): boolean {
    if (this.isGiven(index) || (this.current[index] ?? 0) !== 0) return false;

    const notes = this.pencilled[index];
    if (notes === undefined) return false;

    this.record(index);
    if (notes.has(value)) notes.delete(value);
    else notes.add(value);
    return true;
  }

  /**
   * Fill every empty cell's notes with the digits still legal there.
   *
   * One undoable move, not eighty. Existing notes are replaced rather than
   * merged: the point is to get back to the position a careful player would be
   * in, and a stale pencil mark from three moves ago is exactly what that
   * player would have rubbed out.
   *
   * Returns the number of cells written, so the caller can tell "done" from
   * "there was nothing to do".
   */
  autoNotes(): number {
    const candidates = new Map<number, number[]>();

    for (let index = 0; index < this.current.length; index++) {
      if ((this.current[index] ?? 0) !== 0) continue;
      const digits = candidatesAt(this.current, index);
      const existing = this.pencilled[index];
      /* Skip cells that already say exactly this, so pressing the button twice
         does not add an undo step that changes nothing. */
      if (existing !== undefined && sameDigits(existing, digits)) continue;
      candidates.set(index, digits);
    }

    if (candidates.size === 0) return 0;

    this.record(...candidates.keys());
    for (const [index, digits] of candidates) {
      this.pencilled[index] = new Set(digits);
    }
    return candidates.size;
  }

  /**
   * Write a known-correct digit into a cell and remember that it was given away.
   *
   * Separate from `place` because it must never toggle: a hint that emptied the
   * cell it was asked about would be absurd.
   */
  reveal(index: number, value: number): boolean {
    if (this.isGiven(index) || value === 0) return false;
    if ((this.current[index] ?? 0) === value) return false;

    this.record(index);
    this.current[index] = value;
    this.pencilled[index]?.clear();
    this.revealed.add(index);
    this.hints++;
    return true;
  }

  /**
   * Step back one move. Returns a cell it affected, or `undefined` if the
   * history is empty.
   */
  undo(): number | undefined {
    const move = this.history.pop();
    if (move === undefined) return undefined;

    for (const cell of move.cells) {
      this.current[cell.index] = cell.previousValue;
      this.pencilled[cell.index] = new Set(cell.previousNotes);
      if (cell.previousValue === 0) this.revealed.delete(cell.index);
    }

    return move.cells[0]?.index;
  }
}

function sameDigits(notes: ReadonlySet<number>, digits: readonly number[]): boolean {
  return notes.size === digits.length && digits.every((digit) => notes.has(digit));
}
