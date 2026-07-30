/**
 * Sudoku — saved games and best times.
 *
 * Everything read here is validated against a schema before it is used. This is
 * the tool where that matters most: version 2.0 read a saved game with a bare
 * `JSON.parse` and then indexed `initialBoard[row][col]` while rendering, so a
 * single truncated or hand-edited save meant a `TypeError` on load and a board
 * that never appeared, with no way back short of clearing site data.
 */

import {
  inRange,
  integer,
  lenientArrayOf,
  literals,
  objectOf,
  tupleOf,
  withDefault,
  type Decoder,
} from '../../core/schema.js';
import { defineStore, type Store } from '../../core/storage.js';
import { CELL_COUNT, GRID_SIZE, type Board } from './board.js';

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Most saved games kept. Oldest are dropped, so storage cannot grow forever. */
export const MAX_SAVED_GAMES = 20;

/** Best times kept per difficulty. */
export const MAX_BEST_TIMES = 5;

/** A day, as an upper bound on a believable solve time. */
const MAX_SECONDS = 86_400;

/** A board: exactly 81 cells, each 0–9. Nothing else can reach the renderer. */
const boardDecoder: Decoder<Board> = tupleOf(inRange(integer, 0, 9), CELL_COUNT);

/**
 * Notes: 81 sets, serialised as arrays of digits.
 *
 * Decoded leniently per cell — a corrupt pencil mark should cost that cell's
 * notes, not the whole saved game.
 */
const notesDecoder: Decoder<number[][]> = tupleOf(
  withDefault(lenientArrayOf(inRange(integer, 1, 9)), []),
  CELL_COUNT,
);

export interface SavedGame {
  readonly id: number;
  /** When it was saved, as a timestamp; formatted for display at render time. */
  readonly savedAt: number;
  readonly difficulty: Difficulty;
  readonly seconds: number;
  readonly initialBoard: Board;
  readonly currentBoard: Board;
  readonly notes: number[][];
}

const savedGameDecoder: Decoder<SavedGame> = objectOf({
  id: integer,
  savedAt: integer,
  difficulty: literals(...DIFFICULTIES),
  seconds: inRange(integer, 0, MAX_SECONDS),
  initialBoard: boardDecoder,
  currentBoard: boardDecoder,
  notes: withDefault(notesDecoder, emptyNotesArray()),
});

function emptyNotesArray(): number[][] {
  return Array.from({ length: CELL_COUNT }, () => []);
}

export interface BestTime {
  readonly seconds: number;
  /** The puzzle it was set on, so it can be replayed. */
  readonly board: Board;
  readonly achievedAt: number;
}

const bestTimeDecoder: Decoder<BestTime> = objectOf({
  seconds: inRange(integer, 0, MAX_SECONDS),
  board: boardDecoder,
  achievedAt: withDefault(integer, 0),
});

export type BestTimes = Record<Difficulty, BestTime[]>;

const bestTimesDecoder: Decoder<BestTimes> = objectOf({
  easy: withDefault(lenientArrayOf(bestTimeDecoder), []),
  medium: withDefault(lenientArrayOf(bestTimeDecoder), []),
  hard: withDefault(lenientArrayOf(bestTimeDecoder), []),
  expert: withDefault(lenientArrayOf(bestTimeDecoder), []),
});

/* -------------------------------------------------------------- migration */

/** Version 2.0 stored boards as nine rows of nine. Flatten them. */
const legacyBoardDecoder: Decoder<Board> = (input, path) => {
  const rows = tupleOf(tupleOf(inRange(integer, 0, 9), GRID_SIZE), GRID_SIZE)(input, path);
  return rows.ok ? { ok: true, value: rows.value.flat() } : rows;
};

const legacySavedGameDecoder: Decoder<SavedGame> = (input, path) => {
  const decoded = objectOf({
    id: integer,
    /* `savedAt` was a pre-formatted German date string; the timestamp in `id` is
       the same instant and is actually usable, so that is what is kept. */
    difficulty: literals(...DIFFICULTIES),
    seconds: inRange(integer, 0, MAX_SECONDS),
    initialBoard: legacyBoardDecoder,
    currentBoard: legacyBoardDecoder,
    notesBoard: withDefault(
      tupleOf(
        tupleOf(withDefault(lenientArrayOf(inRange(integer, 1, 9)), []), GRID_SIZE),
        GRID_SIZE,
      ),
      [],
    ),
  })(input, path);

  if (!decoded.ok) return decoded;
  const game = decoded.value;

  return {
    ok: true,
    value: {
      id: game.id,
      savedAt: game.id,
      difficulty: game.difficulty,
      seconds: game.seconds,
      initialBoard: game.initialBoard,
      currentBoard: game.currentBoard,
      notes: game.notesBoard.length === GRID_SIZE ? game.notesBoard.flat() : emptyNotesArray(),
    },
  };
};

const legacyBestTimesDecoder: Decoder<BestTimes> = (input, path) => {
  const perDifficulty = lenientArrayOf(
    objectOf({ time: inRange(integer, 0, MAX_SECONDS), board: legacyBoardDecoder }),
  );
  const decoded = objectOf({
    easy: withDefault(perDifficulty, []),
    medium: withDefault(perDifficulty, []),
    hard: withDefault(perDifficulty, []),
    expert: withDefault(perDifficulty, []),
  })(input, path);

  if (!decoded.ok) return decoded;

  const convert = (entries: { time: number; board: Board }[]): BestTime[] =>
    entries.map((entry) => ({ seconds: entry.time, board: entry.board, achievedAt: 0 }));

  return {
    ok: true,
    value: {
      easy: convert(decoded.value.easy),
      medium: convert(decoded.value.medium),
      hard: convert(decoded.value.hard),
      expert: convert(decoded.value.expert),
    },
  };
};

/* ----------------------------------------------------------------- stores */

export function createSavedGameStore(): Store<SavedGame[]> {
  return defineStore({
    key: 'sudoku.saves',
    decoder: lenientArrayOf(savedGameDecoder),
    fallback: () => [],
    legacy: { key: 'sudokuSaveSlots', decoder: lenientArrayOf(legacySavedGameDecoder) },
  });
}

export function createBestTimeStore(): Store<BestTimes> {
  return defineStore({
    key: 'sudoku.bestTimes',
    decoder: bestTimesDecoder,
    fallback: () => ({ easy: [], medium: [], hard: [], expert: [] }),
    legacy: { key: 'sudokuBestTimes', decoder: legacyBestTimesDecoder },
  });
}

export function createInstantValidationStore(): Store<boolean> {
  return defineStore({
    key: 'sudoku.instantValidation',
    decoder: (input) =>
      typeof input === 'boolean'
        ? { ok: true, value: input }
        : { ok: false, error: 'expected a boolean' },
    fallback: () => true,
    legacy: {
      /* 2.0 stored the strings "1" and "0". */
      key: 'sudokuInstantValidation',
      decoder: (input) => ({ ok: true, value: input !== 0 }),
    },
  });
}

/* ------------------------------------------------------- pure operations */

/** Add a save, newest first, discarding the oldest beyond the cap. */
export function addSave(saves: readonly SavedGame[], game: SavedGame): SavedGame[] {
  return [game, ...saves].slice(0, MAX_SAVED_GAMES);
}

export function removeSave(saves: readonly SavedGame[], id: number): SavedGame[] {
  return saves.filter((save) => save.id !== id);
}

/** Record a time, keeping the fastest few for that difficulty. */
export function addBestTime(times: BestTimes, difficulty: Difficulty, entry: BestTime): BestTimes {
  return {
    ...times,
    [difficulty]: [...times[difficulty], entry]
      .sort((a, b) => a.seconds - b.seconds)
      .slice(0, MAX_BEST_TIMES),
  };
}
