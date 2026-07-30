/**
 * Sudoku — the board and its rules.
 *
 * Boards are flat, row-major arrays of 81 numbers, with 0 for an empty cell.
 * Flat rather than nested because every operation here is either "walk a unit"
 * or "index a cell", and both are simpler and faster on one array.
 */

export const GRID_SIZE = 9;
export const BOX_SIZE = 3;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;

/** A digit that can occupy a cell. 0 means empty. */
export type Cell = number;

/** 81 cells, row-major. */
export type Board = Cell[];

/** Notes pencilled into each cell, one set per cell. */
export type Notes = Set<number>[];

export const DIGITS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function indexOf(row: number, column: number): number {
  return row * GRID_SIZE + column;
}

export function rowOf(index: number): number {
  return Math.floor(index / GRID_SIZE);
}

export function columnOf(index: number): number {
  return index % GRID_SIZE;
}

/** Read a cell, treating anything out of range as empty. */
export function cellAt(board: readonly Cell[], index: number): Cell {
  return board[index] ?? 0;
}

export function emptyBoard(): Board {
  return new Array<number>(CELL_COUNT).fill(0);
}

export function emptyNotes(): Notes {
  return Array.from({ length: CELL_COUNT }, () => new Set<number>());
}

export function cloneBoard(board: readonly Cell[]): Board {
  return [...board];
}

export function cloneNotes(notes: readonly Set<number>[]): Notes {
  return notes.map((set) => new Set(set));
}

/** The 27 units — nine rows, nine columns, nine boxes — as cell indices. */
export const UNITS: readonly (readonly number[])[] = buildUnits();

function buildUnits(): number[][] {
  const units: number[][] = [];

  for (let row = 0; row < GRID_SIZE; row++) {
    units.push(Array.from({ length: GRID_SIZE }, (_, column) => indexOf(row, column)));
  }
  for (let column = 0; column < GRID_SIZE; column++) {
    units.push(Array.from({ length: GRID_SIZE }, (_, row) => indexOf(row, column)));
  }
  for (let boxRow = 0; boxRow < GRID_SIZE; boxRow += BOX_SIZE) {
    for (let boxColumn = 0; boxColumn < GRID_SIZE; boxColumn += BOX_SIZE) {
      const box: number[] = [];
      for (let row = 0; row < BOX_SIZE; row++) {
        for (let column = 0; column < BOX_SIZE; column++) {
          box.push(indexOf(boxRow + row, boxColumn + column));
        }
      }
      units.push(box);
    }
  }
  return units;
}

/**
 * Indices of every cell taking part in a duplicate within its row, column or box.
 *
 * Returning the offending cells rather than a boolean is what lets the UI
 * highlight exactly the conflict. The previous version marked *every* cell of an
 * invalid unit, so one wrong digit reddened all nine.
 */
export function findConflicts(board: readonly Cell[]): Set<number> {
  const conflicts = new Set<number>();

  for (const unit of UNITS) {
    const seen = new Map<number, number[]>();
    for (const index of unit) {
      const value = cellAt(board, index);
      if (value === 0) continue;
      const group = seen.get(value);
      if (group === undefined) seen.set(value, [index]);
      else group.push(index);
    }
    for (const group of seen.values()) {
      if (group.length > 1) for (const index of group) conflicts.add(index);
    }
  }

  return conflicts;
}

/** True when a digit may legally be placed, ignoring whatever is already there. */
export function isLegalPlacement(board: readonly Cell[], index: number, value: number): boolean {
  const row = rowOf(index);
  const column = columnOf(index);

  for (let position = 0; position < GRID_SIZE; position++) {
    if (position !== column && cellAt(board, indexOf(row, position)) === value) return false;
    if (position !== row && cellAt(board, indexOf(position, column)) === value) return false;
  }

  const boxRow = row - (row % BOX_SIZE);
  const boxColumn = column - (column % BOX_SIZE);
  for (let offsetRow = 0; offsetRow < BOX_SIZE; offsetRow++) {
    for (let offsetColumn = 0; offsetColumn < BOX_SIZE; offsetColumn++) {
      const candidate = indexOf(boxRow + offsetRow, boxColumn + offsetColumn);
      if (candidate !== index && cellAt(board, candidate) === value) return false;
    }
  }

  return true;
}

export function isComplete(board: readonly Cell[]): boolean {
  return board.length === CELL_COUNT && !board.includes(0);
}

/** A board is solved when it is full and free of conflicts. */
export function isSolved(board: readonly Cell[]): boolean {
  return isComplete(board) && findConflicts(board).size === 0;
}
