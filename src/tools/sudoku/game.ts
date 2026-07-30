/**
 * Sudoku — the mutable game state and the moves that change it.
 *
 * Separated from the DOM so undo, note toggling and win detection can be tested
 * directly. The UI owns one instance and re-renders from it.
 */

import {
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

interface Move {
  readonly index: number;
  readonly previousValue: number;
  readonly previousNotes: readonly number[];
}

export class Game {
  /** The givens. Cells that are non-zero here can never be changed. */
  private initial: Board = emptyBoard();
  private current: Board = emptyBoard();
  private pencilled: Notes = emptyNotes();
  private history: Move[] = [];

  /** Load a puzzle, discarding any game in progress. */
  reset(
    initial: readonly number[],
    current?: readonly number[],
    notes?: readonly number[][],
  ): void {
    this.initial = cloneBoard(initial);
    this.current = cloneBoard(current ?? initial);
    this.pencilled = notes === undefined ? emptyNotes() : notes.map((digits) => new Set(digits));
    /* Guard against a notes array of the wrong length reaching the renderer. */
    while (this.pencilled.length < this.initial.length) this.pencilled.push(new Set());
    this.history = [];
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

  isGiven(index: number): boolean {
    return (this.initial[index] ?? 0) !== 0;
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

  /** Snapshot for saving. Notes are converted to plain arrays for JSON. */
  snapshot(): { initial: Board; current: Board; notes: number[][] } {
    return {
      initial: cloneBoard(this.initial),
      current: cloneBoard(this.current),
      notes: cloneNotes(this.pencilled).map((set) => [...set]),
    };
  }

  private record(index: number): void {
    this.history.push({
      index,
      previousValue: this.current[index] ?? 0,
      previousNotes: [...(this.pencilled[index] ?? [])],
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

  /** Step back one move. Returns the affected cell, or `undefined` if empty. */
  undo(): number | undefined {
    const move = this.history.pop();
    if (move === undefined) return undefined;

    this.current[move.index] = move.previousValue;
    this.pencilled[move.index] = new Set(move.previousNotes);
    return move.index;
  }
}
