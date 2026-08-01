import { beforeEach, describe, expect, it } from 'vitest';
import { Game, MAX_HISTORY } from './game.js';
import { candidatesAt, CELL_COUNT, emptyBoard, indexOf, mostConstrainedCell } from './board.js';
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

  it('keeps the givens unchanged as the board is played, which is what a hint solves from', () => {
    game.place(firstEmpty(), 5);
    expect(game.givens).toEqual(EXPERT_PUZZLES[0]);
    expect(game.board).not.toEqual(EXPERT_PUZZLES[0]);
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

    it('takes the hints back too, so saving and loading cannot launder them away', () => {
      const restored = new Game();
      restored.reset(EXPERT_PUZZLES[0]!, undefined, undefined, { revealed: [4], hints: 3 });

      expect(restored.isRevealed(4)).toBe(true);
      expect(restored.hintsUsed).toBe(3);
    });

    it('treats a game saved before hints existed as an unassisted one', () => {
      const restored = new Game();
      restored.reset(EXPERT_PUZZLES[0]!);
      expect(restored.hintsUsed).toBe(0);
    });
  });

  describe('auto-notes', () => {
    it('pencils in exactly the digits still legal in each empty cell', () => {
      const index = firstEmpty();
      game.autoNotes();

      const notes = [...game.notesAt(index)].sort();
      expect(notes).toEqual(candidatesAt(EXPERT_PUZZLES[0]!, index).sort());
      expect(notes.length).toBeGreaterThan(0);
    });

    it('never writes a note the solution would contradict', () => {
      const answer = solve(EXPERT_PUZZLES[0]!)!;
      game.autoNotes();

      for (let index = 0; index < CELL_COUNT; index++) {
        if (game.valueAt(index) !== 0) continue;
        expect([...game.notesAt(index)]).toContain(answer[index]);
      }
    });

    it('leaves cells that already hold a digit alone', () => {
      const index = firstGiven();
      game.autoNotes();
      expect(game.notesAt(index).size).toBe(0);
    });

    it('undoes in one step, not one per cell', () => {
      /* Eighty separate undo entries would make the button useless right after
         pressing this one. */
      game.autoNotes();
      expect(game.canUndo).toBe(true);

      game.undo();
      expect(game.canUndo).toBe(false);
      expect(game.notesAt(firstEmpty()).size).toBe(0);
    });

    it('does nothing, and records nothing, when the notes already say this', () => {
      game.autoNotes();
      expect(game.autoNotes()).toBe(0);

      game.undo();
      expect(game.canUndo).toBe(false);
    });

    it('replaces stale marks rather than merging with them', () => {
      const index = firstEmpty();
      /* 0 is never a candidate; a digit that conflicts stands in for a mark left
         over from an earlier position. */
      const impossible = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(
        (digit) => !candidatesAt(EXPERT_PUZZLES[0]!, index).includes(digit),
      )!;
      game.toggleNote(index, impossible);
      game.autoNotes();

      expect(game.notesAt(index).has(impossible)).toBe(false);
    });
  });

  describe('hints', () => {
    it('writes the digit and marks the cell as given away', () => {
      const index = firstEmpty();
      const answer = solve(EXPERT_PUZZLES[0]!)!;

      expect(game.reveal(index, answer[index]!)).toBe(true);
      expect(game.valueAt(index)).toBe(answer[index]);
      expect(game.isRevealed(index)).toBe(true);
      expect(game.hintsUsed).toBe(1);
    });

    it('clears the cell’s notes, as any confirmed digit does', () => {
      const index = firstEmpty();
      game.toggleNote(index, 5);
      game.reveal(index, solve(EXPERT_PUZZLES[0]!)![index]!);

      expect(game.notesAt(index).size).toBe(0);
    });

    it('never empties the cell it was asked about, unlike place()', () => {
      const index = firstEmpty();
      const digit = solve(EXPERT_PUZZLES[0]!)![index]!;
      game.reveal(index, digit);

      /* `place` toggles a repeated digit off; a hint that erased its own answer
         would be absurd. */
      expect(game.reveal(index, digit)).toBe(false);
      expect(game.valueAt(index)).toBe(digit);
    });

    it('refuses a given', () => {
      expect(game.reveal(firstGiven(), 1)).toBe(false);
      expect(game.hintsUsed).toBe(0);
    });

    it('takes the mark back when the hint is undone, but not the count', () => {
      const index = firstEmpty();
      game.reveal(index, solve(EXPERT_PUZZLES[0]!)![index]!);
      game.undo();

      expect(game.isRevealed(index)).toBe(false);
      /* Undoing puts the digit back; it does not unsee it, so the solve stays an
         assisted one. */
      expect(game.hintsUsed).toBe(1);
    });

    it('stops counting a cell as hinted once the player types over it', () => {
      const index = firstEmpty();
      const digit = solve(EXPERT_PUZZLES[0]!)![index]!;
      game.reveal(index, digit);
      game.place(index, digit === 9 ? 1 : 9);

      expect(game.isRevealed(index)).toBe(false);
    });

    it('is forgotten when the puzzle is restarted', () => {
      const index = firstEmpty();
      game.reveal(index, solve(EXPERT_PUZZLES[0]!)![index]!);
      game.restart();

      expect(game.hintsUsed).toBe(0);
      expect(game.isRevealed(index)).toBe(false);
    });
  });
});

describe('mostConstrainedCell', () => {
  it('is the empty cell a player would have solved next, not the first in reading order', () => {
    const board = emptyBoard();
    /* Eight of the nine digits in the last row leave exactly one candidate for
       the ninth cell, while cell 0 still takes any digit at all. */
    for (let column = 0; column < 8; column++) board[indexOf(8, column)] = column + 1;

    expect(mostConstrainedCell(board)).toBe(indexOf(8, 8));
    expect(candidatesAt(board, indexOf(8, 8))).toEqual([9]);
  });

  it('is undefined for a full board, so a hint has something to say instead of throwing', () => {
    expect(mostConstrainedCell(solve(EXPERT_PUZZLES[0]!)!)).toBeUndefined();
  });

  it('reports no candidates for a cell that already holds a digit', () => {
    expect(candidatesAt(EXPERT_PUZZLES[0]!, firstGivenOf(EXPERT_PUZZLES[0]!))).toEqual([]);
  });
});

function firstGivenOf(puzzle: readonly number[]): number {
  return puzzle.findIndex((value) => value !== 0);
}
