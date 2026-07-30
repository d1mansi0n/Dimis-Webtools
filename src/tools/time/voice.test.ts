import { describe, expect, it } from 'vitest';
import { normalise, parseCommand } from './voice.js';

describe('normalise', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalise('  Start,   the   TIMER! ')).toBe('start the timer');
  });

  it('keeps letters from other scripts, including umlauts', () => {
    expect(normalise('Eintrag hinzufügen!')).toBe('eintrag hinzufügen');
  });

  it('keeps digits', () => {
    expect(normalise('note 42')).toBe('note 42');
  });
});

describe('parseCommand', () => {
  it.each([
    ['new entry', 'newEntry'],
    ['neuer Eintrag', 'newEntry'],
    ['Eintrag hinzufügen', 'newEntry'],
    ['start', 'start'],
    ['starte timer', 'start'],
    ['los', 'start'],
    ['pause', 'pause'],
    ['pausieren', 'pause'],
    ['stop', 'stop'],
    ['stopp', 'stop'],
    ['beenden', 'stop'],
  ])('recognises %j as %s', (phrase, kind) => {
    expect(parseCommand(phrase)?.kind).toBe(kind);
  });

  it('recognises commands inside a longer utterance', () => {
    expect(parseCommand('okay please start now')?.kind).toBe('start');
  });

  it('extracts the text of a comment', () => {
    expect(parseCommand('comment client meeting')).toEqual({
      kind: 'comment',
      text: 'client meeting',
    });
  });

  it('extracts a German comment', () => {
    expect(parseCommand('Kommentar Kundengespräch')).toEqual({
      kind: 'comment',
      text: 'kundengespräch',
    });
  });

  it('prefers a comment over a timer verb inside it', () => {
    /* "comment stop by the office" should record text, not stop the timer. */
    expect(parseCommand('comment stop by the office')).toEqual({
      kind: 'comment',
      text: 'stop by the office',
    });
  });

  it('reports an empty comment rather than guessing', () => {
    expect(parseCommand('comment')).toEqual({ kind: 'comment', text: '' });
  });

  it('returns nothing for an unrecognised phrase', () => {
    expect(parseCommand('what is the weather like')).toBeUndefined();
  });

  it('returns nothing for silence', () => {
    expect(parseCommand('   ')).toBeUndefined();
  });

  it('does not match a command word inside a longer word', () => {
    /* "restart" contains "start"; a word-boundary match keeps them apart. */
    expect(parseCommand('restarting the machine')).toBeUndefined();
  });

  it('tolerates extra spacing inside a multi-word command', () => {
    expect(parseCommand('neuer    eintrag')?.kind).toBe('newEntry');
  });

  it('is not confused by punctuation', () => {
    expect(parseCommand('Stop!')?.kind).toBe('stop');
  });
});
