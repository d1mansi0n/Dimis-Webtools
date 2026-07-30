import { beforeEach, describe, expect, it } from 'vitest';
import { Game, MAX_HISTORY } from './game.js';
import { CELL_COUNT, emptyBoard, indexOf } from './board.js';
import { EXPERT_PUZZLES } from './puzzles.js';
import { solve } from './generator.js';

describe('Game', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.reset(EXPERT_PUZZLES[0]!);
  });

  const firstEmpty = (): number => EXPERT_PUZZLES[0]!.findIndex((value) => value === 0);
  const firstGiven = (): number => EXPERT_PUZZLES[0]!.findIndex((value) => value !== 0);

  it('starts from the givens with no history', () => {
    expect(game.board).toEqual(EXPERT_PUZZLES[0]);
    expect(game.canUndo).toBe(false);
  });

  it('places a digit in an empty cell', () => {
    const index = firstEmpty();
    expect(game.place(index, 5)).toBe(true);
    expect(game.valueAt(index)).toBe(5);
  });

  it('clears the cell when the same digit is entered twice', () => {
    const index = firstEmpty();
    game.place(index, 5);
    game.place(index, 5);
    expect(game.valueAt(index)).toBe(0);
  });

  it('refuses to change a given', () => {
    const index = firstGiven();
    const before = game.valueAt(index);
    expect(game.place(index, 9)).toBe(false);
    expect(game.valueAt(index)).toBe(before);
  });

  it('reports no change when nothing happens', () => {
    expect(game.erase(firstEmpty())).toBe(false);
  });

  describe('notes', () => {
    it('toggles a pencil mark on and off', () => {
      const index = firstEmpty();
      game.toggleNote(index, 3);
      expect([...game.notesAt(index)]).toEqual([3]);
      game.toggleNote(index, 3);
      expect(game.notesAt(index).size).toBe(0);
    });

    it('keeps several notes in one cell', () => {
      const index = firstEmpty();
      for (const digit of [1, 5, 9]) game.toggleNote(index, digit);
      expect([...game.notesAt(index)].sort()).toEqual([1, 5, 9]);
    });

    it('refuses notes on a cell that already holds a digit', () => {
      const index = firstEmpty();
      game.place(index, 4);
      expect(game.toggleNote(index, 7)).toBe(false);
    });

    it('clears the notes when a digit is placed', () => {
      const index = firstEmpty();
      game.toggleNote(index, 2);
      game.place(index, 6);
      expect(game.notesAt(index).size).toBe(0);
    });

    it('refuses notes on a given', () => {
      expect(game.toggleNote(firstGiven(), 1)).toBe(false);
    });
  });

  describe('undo', () => {
    it('reverses a placement', () => {
      const index = firstEmpty();
      game.place(index, 5);
      expect(game.undo()).toBe(index);
      expect(game.valueAt(index)).toBe(0);
    });

    it('restores notes that a placement wiped out', () => {
      const index = firstEmpty();
      game.toggleNote(index, 3);
      game.toggleNote(index, 8);
      game.place(index, 1);
      game.undo();

      expect(game.valueAt(index)).toBe(0);
      expect([...game.notesAt(index)].sort()).toEqual([3, 8]);
    });

    it('reverses a note toggle', () => {
      const index = firstEmpty();
      game.toggleNote(index, 4);
      game.undo();
      expect(game.notesAt(index).size).toBe(0);
    });

    it('unwinds several moves in order', () => {
      const index = firstEmpty();
      game.place(index, 1);
      game.place(index, 2);
      game.place(index, 3);

      game.undo();
      expect(game.valueAt(index)).toBe(2);
      game.undo();
      expect(game.valueAt(index)).toBe(1);
      game.undo();
      expect(game.valueAt(index)).toBe(0);
    });

    it('reports nothing to undo on an untouched board', () => {
      expect(game.undo()).toBeUndefined();
      expect(game.canUndo).toBe(false);
    });

    it('bounds the history so a long session cannot grow without limit', () => {
      const index = firstEmpty();
      for (let move = 0; move < MAX_HISTORY + 50; move++) {
        game.place(index, (move % 9) + 1);
      }
      let undone = 0;
      while (game.canUndo) {
        game.undo();
        undone++;
      }
      expect(undone).toBe(MAX_HISTORY);
    });
  });

  describe('restart', () => {
    it('returns to the givens and forgets the history', () => {
      game.place(firstEmpty(), 7);
      game.restart();
      expect(game.board).toEqual(EXPERT_PUZZLES[0]);
      expect(game.canUndo).toBe(false);
    });
  });

  describe('conflicts and completion', () => {
    it('reports a duplicate the player creates', () => {
      const board = emptyBoard();
      const fresh = new Game();
      fresh.reset(board);
      fresh.place(indexOf(0, 0), 5);
      fresh.place(indexOf(0, 1), 5);
      expect(fresh.conflicts().size).toBe(2);
    });

    it('is not solved while cells remain empty', () => {
      expect(game.isSolved()).toBe(false);
    });

    it('is solved once the correct digits are all in place', () => {
      const solution = solve(EXPERT_PUZZLES[0]!)!;
      for (let index = 0; index < CELL_COUNT; index++) {
        if (!game.isGiven(index)) game.place(index, solution[index] ?? 0);
      }
      expect(game.isSolved()).toBe(true);
    });
  });

  describe('snapshot', () => {
    it('captures the board and notes for saving', () => {
      const index = firstEmpty();
      game.place(index, 4);
      const other = EXPERT_PUZZLES[0]!.findIndex(
        (value, position) => value === 0 && position > index,
      );
      game.toggleNote(other, 6);

      const snapshot = game.snapshot();
      expect(snapshot.current[index]).toBe(4);
      expect(snapshot.notes[other]).toEqual([6]);
      expect(snapshot.initial).toEqual(EXPERT_PUZZLES[0]);
    });

    it('is a copy, so later moves do not alter it', () => {
      const snapshot = game.snapshot();
      game.place(firstEmpty(), 9);
      expect(snapshot.current).toEqual(EXPERT_PUZZLES[0]);
    });
  });

  describe('restoring a saved game', () => {
    it('takes the board and notes back', () => {
      const current = [...EXPERT_PUZZLES[0]!];
      const index = firstEmpty();
      current[index] = 8;
      const notes = Array.from({ length: CELL_COUNT }, () => [] as number[]);
      notes[index + 1] = [2, 4];

      const restored = new Game();
      restored.reset(EXPERT_PUZZLES[0]!, current, notes);

      expect(restored.valueAt(index)).toBe(8);
      expect([...restored.notesAt(index + 1)].sort()).toEqual([2, 4]);
      expect(restored.isGiven(index)).toBe(false);
    });

    it('tolerates a notes array that is too short', () => {
      const restored = new Game();
      restored.reset(EXPERT_PUZZLES[0]!, undefined, [[1]]);
      expect(() => restored.notesAt(CELL_COUNT - 1)).not.toThrow();
      expect(restored.notesAt(CELL_COUNT - 1).size).toBe(0);
    });
  });
});
