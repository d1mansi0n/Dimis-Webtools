/**
 * Sudoku — solving and puzzle generation.
 *
 * Pure functions with an injectable random source, so generation is
 * deterministic under test. This runs inside a worker in the application; there
 * is nothing browser-specific here.
 *
 * ### What was wrong with the previous generator
 *
 * Version 2.0 removed clues like this:
 *
 * ```js
 * let attempts = NUM_CELLS - clues;
 * while (attempts > 0) {
 *   const row = random(), col = random();       // a random cell, possibly empty
 *   if (board[row][col] !== 0) { …; if (unique) attempts--; else restore; }
 * }
 * ```
 *
 * The loop only ends when it has removed exactly as many clues as asked for. Once
 * no remaining clue can be removed without making the puzzle ambiguous — which
 * happens routinely at the harder settings — it spins forever, pinning a core.
 * Because it ran in a worker the page stayed responsive, so the failure showed up
 * as a "Generating…" message that never cleared.
 *
 * The version below walks a shuffled list of positions exactly once. It always
 * terminates, and returns the best puzzle it could reach along with how many
 * clues that actually left.
 */

import { CELL_COUNT, DIGITS, cloneBoard, emptyBoard, type Board, type Cell } from './board.js';

/** Source of randomness. Injectable so tests can pin a sequence. */
export type Random = () => number;

/* ------------------------------------------------------------------ solving
 *
 * The search below tracks which digits remain legal using one 9-bit mask per
 * row, column and box, updated as values are placed and unplaced. Asking whether
 * a digit fits becomes a single bitwise test instead of scanning 27 cells.
 *
 * That matters because generation calls the solver up to 81 times, once per
 * candidate clue removal, and each of those explores a search tree. A
 * straightforward scan-the-neighbours check makes generating a hard puzzle take
 * tens of seconds; this makes it milliseconds.
 */

const ALL_DIGITS_MASK = 0b1_1111_1111;

const BOX_OF: readonly number[] = Array.from({ length: CELL_COUNT }, (_, index) => {
  const row = Math.floor(index / 9);
  const column = index % 9;
  return Math.floor(row / 3) * 3 + Math.floor(column / 3);
});

interface Constraints {
  readonly cells: Int8Array;
  readonly rows: Uint16Array;
  readonly columns: Uint16Array;
  readonly boxes: Uint16Array;
}

/** Build the mask state for a board. Returns `undefined` if it already conflicts. */
function constraintsFor(board: readonly Cell[]): Constraints | undefined {
  const state: Constraints = {
    cells: new Int8Array(CELL_COUNT),
    rows: new Uint16Array(9),
    columns: new Uint16Array(9),
    boxes: new Uint16Array(9),
  };

  for (let index = 0; index < CELL_COUNT; index++) {
    const value = board[index] ?? 0;
    if (value === 0) continue;

    const bit = 1 << (value - 1);
    const row = Math.floor(index / 9);
    const column = index % 9;
    const box = BOX_OF[index] ?? 0;

    /* A board that is already self-contradictory has no solutions; saying so
       here keeps the search itself free of that case. */
    if (
      ((state.rows[row] ?? 0) & bit) !== 0 ||
      ((state.columns[column] ?? 0) & bit) !== 0 ||
      ((state.boxes[box] ?? 0) & bit) !== 0
    ) {
      return undefined;
    }

    state.cells[index] = value;
    state.rows[row] = (state.rows[row] ?? 0) | bit;
    state.columns[column] = (state.columns[column] ?? 0) | bit;
    state.boxes[box] = (state.boxes[box] ?? 0) | bit;
  }

  return state;
}

function candidatesAt(state: Constraints, index: number): number {
  const used =
    (state.rows[Math.floor(index / 9)] ?? 0) |
    (state.columns[index % 9] ?? 0) |
    (state.boxes[BOX_OF[index] ?? 0] ?? 0);
  return ~used & ALL_DIGITS_MASK;
}

function popcount9(mask: number): number {
  let count = 0;
  for (let bits = mask; bits !== 0; bits &= bits - 1) count++;
  return count;
}

function assign(state: Constraints, index: number, value: number): void {
  const bit = 1 << (value - 1);
  const row = Math.floor(index / 9);
  const column = index % 9;
  const box = BOX_OF[index] ?? 0;

  state.cells[index] = value;
  state.rows[row] = (state.rows[row] ?? 0) | bit;
  state.columns[column] = (state.columns[column] ?? 0) | bit;
  state.boxes[box] = (state.boxes[box] ?? 0) | bit;
}

function unassign(state: Constraints, index: number, value: number): void {
  const bit = 1 << (value - 1);
  const row = Math.floor(index / 9);
  const column = index % 9;
  const box = BOX_OF[index] ?? 0;

  state.cells[index] = 0;
  state.rows[row] = (state.rows[row] ?? 0) & ~bit;
  state.columns[column] = (state.columns[column] ?? 0) & ~bit;
  state.boxes[box] = (state.boxes[box] ?? 0) & ~bit;
}

/**
 * Depth-first search over the empty cells, always branching on the cell with the
 * fewest remaining candidates.
 *
 * Calls `onSolution` for each complete grid and stops when it returns `false`.
 */
function search(state: Constraints, onSolution: () => boolean): boolean {
  let bestIndex = -1;
  let bestMask = 0;
  let bestCount = 10;

  for (let index = 0; index < CELL_COUNT; index++) {
    if (state.cells[index] !== 0) continue;
    const mask = candidatesAt(state, index);
    const count = popcount9(mask);
    if (count === 0) return true; // dead end: keep searching elsewhere
    if (count < bestCount) {
      bestIndex = index;
      bestMask = mask;
      bestCount = count;
      if (count === 1) break; // forced move; nothing will beat it
    }
  }

  if (bestIndex === -1) return onSolution();

  for (let value = 1; value <= 9; value++) {
    if ((bestMask & (1 << (value - 1))) === 0) continue;
    assign(state, bestIndex, value);
    const keepGoing = search(state, onSolution);
    unassign(state, bestIndex, value);
    if (!keepGoing) return false;
  }
  return true;
}

/**
 * Count solutions, stopping as soon as `limit` is reached.
 *
 * Uniqueness only needs to tell "one" from "more than one", so the search stops
 * at two. Counting every solution of a sparse grid is astronomically expensive
 * and answers a question nobody asked.
 */
export function countSolutions(board: readonly Cell[], limit = 2): number {
  const state = constraintsFor(board);
  if (state === undefined) return 0;

  let found = 0;
  search(state, () => {
    found++;
    return found < limit;
  });
  return found;
}

export function hasUniqueSolution(board: readonly Cell[]): boolean {
  return countSolutions(board, 2) === 1;
}

/** Solve a board, returning the first solution found, or `undefined`. */
export function solve(board: readonly Cell[]): Board | undefined {
  const state = constraintsFor(board);
  if (state === undefined) return undefined;

  let solution: Board | undefined;
  search(state, () => {
    solution = Array.from(state.cells);
    return false;
  });
  return solution;
}

/** Fisher-Yates, using the supplied random source. */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    const a = result[index];
    const b = result[swap];
    /* istanbul ignore next -- both indices are in range by construction */
    if (a === undefined || b === undefined) continue;
    result[index] = b;
    result[swap] = a;
  }
  return result;
}

/** Build a random, fully solved grid. */
export function generateSolved(random: Random = Math.random): Board {
  const state = constraintsFor(emptyBoard());
  /* istanbul ignore next -- an empty board cannot contain a conflict */
  if (state === undefined) throw new Error('An empty board unexpectedly held a conflict.');

  const fill = (index: number): boolean => {
    if (index >= CELL_COUNT) return true;
    const mask = candidatesAt(state, index);
    /* Digits are tried in a random order, which is the only source of variety:
       the cell order is fixed, so the shuffle alone decides the grid. */
    for (const value of shuffle(DIGITS, random)) {
      if ((mask & (1 << (value - 1))) === 0) continue;
      assign(state, index, value);
      if (fill(index + 1)) return true;
      unassign(state, index, value);
    }
    return false;
  };

  fill(0);
  return Array.from(state.cells);
}

export interface GeneratedPuzzle {
  readonly puzzle: Board;
  /** The full solution, kept so the UI never has to solve it again. */
  readonly solution: Board;
  /** Clues actually left. May exceed the target when nothing more can be removed. */
  readonly clues: number;
}

/**
 * Generate a puzzle with a unique solution and roughly `targetClues` givens.
 *
 * Removal is attempted once per position, in a random order, and each removal is
 * kept only if the puzzle still has exactly one solution. This terminates after
 * at most 81 uniqueness checks whatever happens, which is the property the old
 * implementation lacked.
 */
export function generatePuzzle(targetClues: number, random: Random = Math.random): GeneratedPuzzle {
  const solution = generateSolved(random);
  const puzzle = cloneBoard(solution);
  let clues = CELL_COUNT;

  for (const index of shuffle(
    Array.from({ length: CELL_COUNT }, (_, position) => position),
    random,
  )) {
    if (clues <= targetClues) break;

    const removed = puzzle[index];
    if (removed === undefined || removed === 0) continue;

    puzzle[index] = 0;
    if (hasUniqueSolution(puzzle)) {
      clues--;
    } else {
      puzzle[index] = removed; // ambiguous without it; put it back
    }
  }

  return { puzzle, solution, clues };
}

/** Target clue counts per difficulty. Fewer clues means a harder puzzle. */
export const DIFFICULTY_CLUES = {
  easy: 38,
  medium: 32,
  hard: 27,
} as const;

export type GeneratedDifficulty = keyof typeof DIFFICULTY_CLUES;
