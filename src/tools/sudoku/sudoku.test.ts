import { describe, expect, it, vi } from 'vitest';
import {
  CELL_COUNT,
  emptyBoard,
  findConflicts,
  GRID_SIZE,
  indexOf,
  isComplete,
  isLegalPlacement,
  isSolved,
  UNITS,
  type Board,
} from './board.js';
import {
  countSolutions,
  DIFFICULTY_CLUES,
  generatePuzzle,
  generateSolved,
  hasUniqueSolution,
  shuffle,
  solve,
} from './generator.js';
import { EXPERT_PUZZLES } from './puzzles.js';
import {
  addBestTime,
  addSave,
  createBestTimeStore,
  createInstantValidationStore,
  createSavedGameStore,
  MAX_BEST_TIMES,
  MAX_SAVED_GAMES,
  removeSave,
  type SavedGame,
} from './persistence.js';

/** A deterministic pseudo-random source, so generation is reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    /* xorshift32 — small, fast, and good enough to shuffle with. */
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100_000) / 100_000;
  };
}

describe('units', () => {
  it('covers nine rows, nine columns and nine boxes', () => {
    expect(UNITS).toHaveLength(27);
    for (const unit of UNITS) expect(unit).toHaveLength(GRID_SIZE);
  });

  it('touches every cell exactly three times, once per kind of unit', () => {
    const counts = new Array<number>(CELL_COUNT).fill(0);
    for (const unit of UNITS) for (const index of unit) counts[index] = (counts[index] ?? 0) + 1;
    expect(counts.every((count) => count === 3)).toBe(true);
  });
});

describe('findConflicts', () => {
  it('finds nothing in an empty board', () => {
    expect(findConflicts(emptyBoard()).size).toBe(0);
  });

  it('reports both cells of a duplicate in a row', () => {
    const board = emptyBoard();
    board[indexOf(0, 0)] = 5;
    board[indexOf(0, 8)] = 5;
    expect([...findConflicts(board)].sort((a, b) => a - b)).toEqual([indexOf(0, 0), indexOf(0, 8)]);
  });

  it('reports duplicates in a column', () => {
    const board = emptyBoard();
    board[indexOf(0, 3)] = 7;
    board[indexOf(5, 3)] = 7;
    expect(findConflicts(board).size).toBe(2);
  });

  it('reports duplicates inside a box', () => {
    const board = emptyBoard();
    board[indexOf(3, 3)] = 2;
    board[indexOf(5, 5)] = 2;
    expect(findConflicts(board).size).toBe(2);
  });

  it('marks only the offending cells, not the whole unit', () => {
    /* Version 2.0 reddened all nine cells of any unit containing a duplicate. */
    const board = emptyBoard();
    for (let column = 0; column < GRID_SIZE; column++) board[indexOf(0, column)] = column + 1;
    board[indexOf(0, 8)] = 1; // now duplicates the 1 at column 0

    const conflicts = findConflicts(board);
    expect(conflicts.size).toBe(2);
    expect(conflicts.has(indexOf(0, 4))).toBe(false);
  });

  it('ignores empty cells', () => {
    const board = emptyBoard();
    board[0] = 0;
    board[1] = 0;
    expect(findConflicts(board).size).toBe(0);
  });
});

describe('isLegalPlacement', () => {
  it('rejects a digit already in the row, column or box', () => {
    const board = emptyBoard();
    board[indexOf(0, 0)] = 4;
    expect(isLegalPlacement(board, indexOf(0, 5), 4)).toBe(false);
    expect(isLegalPlacement(board, indexOf(5, 0), 4)).toBe(false);
    expect(isLegalPlacement(board, indexOf(1, 1), 4)).toBe(false);
  });

  it('allows a digit that clashes with nothing', () => {
    expect(isLegalPlacement(emptyBoard(), 40, 9)).toBe(true);
  });

  it('does not count the cell itself as a clash', () => {
    const board = emptyBoard();
    board[10] = 3;
    expect(isLegalPlacement(board, 10, 3)).toBe(true);
  });
});

describe('completeness', () => {
  it('recognises an unfinished board', () => {
    expect(isComplete(emptyBoard())).toBe(false);
  });

  it('recognises a solved board', () => {
    const solved = generateSolved(seededRandom(1));
    expect(isComplete(solved)).toBe(true);
    expect(isSolved(solved)).toBe(true);
  });

  it('rejects a full board that breaks the rules', () => {
    const board = new Array<number>(CELL_COUNT).fill(1);
    expect(isComplete(board)).toBe(true);
    expect(isSolved(board)).toBe(false);
  });
});

describe('shuffle', () => {
  it('keeps every element', () => {
    const shuffled = shuffle([1, 2, 3, 4, 5], seededRandom(7));
    expect([...shuffled].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not mutate its input', () => {
    const original = [1, 2, 3];
    shuffle(original, seededRandom(7));
    expect(original).toEqual([1, 2, 3]);
  });
});

describe('generateSolved', () => {
  it('produces a valid, complete grid', () => {
    for (const seed of [1, 42, 12345]) {
      expect(isSolved(generateSolved(seededRandom(seed)))).toBe(true);
    }
  });

  it('produces different grids from different seeds', () => {
    expect(generateSolved(seededRandom(1))).not.toEqual(generateSolved(seededRandom(2)));
  });
});

describe('countSolutions', () => {
  it('finds exactly one solution for a well-formed puzzle', () => {
    expect(countSolutions(EXPERT_PUZZLES[0]!)).toBe(1);
  });

  it('stops counting at the limit', () => {
    expect(countSolutions(emptyBoard(), 2)).toBe(2);
  });

  it('finds none for a contradictory board', () => {
    const board = emptyBoard();
    board[0] = 5;
    board[1] = 5;
    expect(countSolutions(board)).toBe(0);
  });

  it('recognises an already-solved board as having one solution', () => {
    expect(countSolutions(generateSolved(seededRandom(3)))).toBe(1);
  });
});

describe('solve', () => {
  it('solves every expert puzzle', () => {
    for (const puzzle of EXPERT_PUZZLES) {
      const solution = solve(puzzle);
      expect(solution).toBeDefined();
      expect(isSolved(solution!)).toBe(true);
    }
  });

  it('keeps the original clues in place', () => {
    const puzzle = EXPERT_PUZZLES[0]!;
    const solution = solve(puzzle)!;
    puzzle.forEach((value, index) => {
      if (value !== 0) expect(solution[index]).toBe(value);
    });
  });

  it('returns undefined for an unsolvable board', () => {
    const board = emptyBoard();
    board[0] = 1;
    board[1] = 1;
    expect(solve(board)).toBeUndefined();
  });
});

describe('generatePuzzle', () => {
  it.each(Object.entries(DIFFICULTY_CLUES))(
    'generates a uniquely solvable %s puzzle',
    (_difficulty, clues) => {
      const { puzzle, solution } = generatePuzzle(clues, seededRandom(99));
      expect(hasUniqueSolution(puzzle)).toBe(true);
      expect(isSolved(solution)).toBe(true);
    },
  );

  it('reaches roughly the requested clue count', () => {
    const { clues } = generatePuzzle(DIFFICULTY_CLUES.easy, seededRandom(5));
    expect(clues).toBeLessThanOrEqual(DIFFICULTY_CLUES.easy + 8);
    expect(clues).toBeGreaterThanOrEqual(DIFFICULTY_CLUES.easy - 1);
  });

  it('always terminates, even when asked for an impossible number of clues', () => {
    /* Version 2.0 looped forever here: it only stopped once it had removed the
       requested number of clues, which for a target this low never happens. */
    const { puzzle, clues } = generatePuzzle(1, seededRandom(11));
    expect(hasUniqueSolution(puzzle)).toBe(true);
    expect(clues).toBeGreaterThan(1);
  }, 30_000);

  it('is deterministic for a fixed seed', () => {
    expect(generatePuzzle(35, seededRandom(4)).puzzle).toEqual(
      generatePuzzle(35, seededRandom(4)).puzzle,
    );
  });

  it('produces a puzzle whose clues match its own solution', () => {
    const { puzzle, solution } = generatePuzzle(35, seededRandom(8));
    puzzle.forEach((value, index) => {
      if (value !== 0) expect(solution[index]).toBe(value);
    });
  });
});

describe('the expert puzzle bank', () => {
  it('has twenty boards', () => {
    expect(EXPERT_PUZZLES).toHaveLength(20);
  });

  it('gives every board exactly 81 cells holding 0–9', () => {
    for (const puzzle of EXPERT_PUZZLES) {
      expect(puzzle).toHaveLength(CELL_COUNT);
      expect(puzzle.every((value) => Number.isInteger(value) && value >= 0 && value <= 9)).toBe(
        true,
      );
    }
  });

  it('starts every board from a position with no conflicts', () => {
    for (const puzzle of EXPERT_PUZZLES) expect(findConflicts(puzzle).size).toBe(0);
  });

  it('gives every board exactly one solution', () => {
    for (const [position, puzzle] of EXPERT_PUZZLES.entries()) {
      expect(hasUniqueSolution(puzzle), `puzzle ${String(position + 1)}`).toBe(true);
    }
  }, 60_000);

  it('has no duplicate boards', () => {
    const seen = new Set(EXPERT_PUZZLES.map((puzzle) => puzzle.join('')));
    expect(seen.size).toBe(EXPERT_PUZZLES.length);
  });
});

/* ------------------------------------------------------------ persistence */

const sampleGame = (id: number): SavedGame => ({
  id,
  savedAt: id,
  difficulty: 'medium',
  seconds: 120,
  initialBoard: EXPERT_PUZZLES[0]!,
  currentBoard: EXPERT_PUZZLES[0]!,
  notes: Array.from({ length: CELL_COUNT }, () => []),
});

describe('saved games', () => {
  it('round-trips a save', () => {
    const store = createSavedGameStore();
    store.write([sampleGame(1)]);
    expect(createSavedGameStore().read()).toEqual([sampleGame(1)]);
  });

  it('keeps the newest first and caps the list', () => {
    let saves: SavedGame[] = [];
    for (let id = 0; id < MAX_SAVED_GAMES + 5; id++) saves = addSave(saves, sampleGame(id));

    expect(saves).toHaveLength(MAX_SAVED_GAMES);
    expect(saves[0]?.id).toBe(MAX_SAVED_GAMES + 4);
  });

  it('removes a save by id', () => {
    expect(removeSave([sampleGame(1), sampleGame(2)], 1).map((save) => save.id)).toEqual([2]);
  });

  it('rejects a board of the wrong length instead of crashing the renderer', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem(
      'dwt:sudoku.saves',
      JSON.stringify([{ ...sampleGame(1), initialBoard: [1, 2, 3] }]),
    );
    expect(createSavedGameStore().read()).toEqual([]);
  });

  it('rejects a board holding a value outside 0-9', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const board = [...EXPERT_PUZZLES[0]!];
    board[0] = 42;
    localStorage.setItem(
      'dwt:sudoku.saves',
      JSON.stringify([{ ...sampleGame(1), currentBoard: board }]),
    );
    expect(createSavedGameStore().read()).toEqual([]);
  });

  it('keeps the readable saves when one entry is corrupt', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem(
      'dwt:sudoku.saves',
      JSON.stringify([sampleGame(1), { id: 'broken' }, sampleGame(3)]),
    );
    expect(
      createSavedGameStore()
        .read()
        .map((save) => save.id),
    ).toEqual([1, 3]);
  });

  it('migrates a version 2.0 save, flattening its nested boards', () => {
    const nested = (flat: readonly number[]): number[][] =>
      Array.from({ length: GRID_SIZE }, (_, row) =>
        flat.slice(row * GRID_SIZE, row * GRID_SIZE + GRID_SIZE),
      );

    localStorage.setItem(
      'sudokuSaveSlots',
      JSON.stringify([
        {
          id: 1700000000000,
          savedAt: '29.7.2026, 12:00:00',
          difficulty: 'hard',
          seconds: 300,
          initialBoard: nested(EXPERT_PUZZLES[0]!),
          currentBoard: nested(EXPERT_PUZZLES[0]!),
          notesBoard: Array.from({ length: GRID_SIZE }, () =>
            Array.from({ length: GRID_SIZE }, () => []),
          ),
        },
      ]),
    );

    const [save] = createSavedGameStore().read();
    expect(save?.initialBoard).toEqual(EXPERT_PUZZLES[0]);
    expect(save?.difficulty).toBe('hard');
    expect(save?.savedAt).toBe(1700000000000);
  });
});

describe('best times', () => {
  const entry = (seconds: number): { seconds: number; board: Board; achievedAt: number } => ({
    seconds,
    board: EXPERT_PUZZLES[0]!,
    achievedAt: 0,
  });

  it('starts empty for every difficulty', () => {
    expect(createBestTimeStore().read()).toEqual({ easy: [], medium: [], hard: [], expert: [] });
  });

  it('keeps the fastest times in order', () => {
    let times = createBestTimeStore().read();
    for (const seconds of [300, 100, 200]) times = addBestTime(times, 'easy', entry(seconds));
    expect(times.easy.map((best) => best.seconds)).toEqual([100, 200, 300]);
  });

  it('keeps only the fastest few', () => {
    let times = createBestTimeStore().read();
    for (let seconds = 1; seconds <= MAX_BEST_TIMES + 5; seconds++) {
      times = addBestTime(times, 'hard', entry(seconds));
    }
    expect(times.hard).toHaveLength(MAX_BEST_TIMES);
    expect(times.hard[0]?.seconds).toBe(1);
  });

  it('does not disturb the other difficulties', () => {
    const times = addBestTime(createBestTimeStore().read(), 'easy', entry(50));
    expect(times.expert).toEqual([]);
  });

  it('migrates version 2.0 best times', () => {
    localStorage.setItem(
      'sudokuBestTimes',
      JSON.stringify({
        easy: [
          {
            time: 90,
            board: Array.from({ length: GRID_SIZE }, (_, row) =>
              EXPERT_PUZZLES[0]!.slice(row * GRID_SIZE, row * GRID_SIZE + GRID_SIZE),
            ),
          },
        ],
        medium: [],
        hard: [],
        expert: [],
      }),
    );

    const times = createBestTimeStore().read();
    expect(times.easy[0]?.seconds).toBe(90);
    expect(times.easy[0]?.board).toEqual(EXPERT_PUZZLES[0]);
  });
});

describe('instant validation preference', () => {
  it('defaults to on', () => {
    expect(createInstantValidationStore().read()).toBe(true);
  });

  it('round-trips', () => {
    const store = createInstantValidationStore();
    store.write(false);
    expect(createInstantValidationStore().read()).toBe(false);
  });

  it('migrates the version 2.0 string value', () => {
    localStorage.setItem('sudokuInstantValidation', '0');
    expect(createInstantValidationStore().read()).toBe(false);
  });
});
