import { afterEach, describe, expect, it, vi } from 'vitest';
import { isVoiceSupported, normalise, parseCommand, SpeechController } from './voice.js';

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

/* ------------------------------------------------------- SpeechController */

/**
 * A stand-in for the browser's `SpeechRecognition`.
 *
 * The real API needs a microphone and a user gesture, so the controller is
 * driven through this instead: the tests call `emitResult`/`emitError` to play
 * the part of the recogniser. This is the whole reason the browser API is kept
 * behind such a thin wrapper.
 */
class FakeRecognition {
  static instances: FakeRecognition[] = [];

  lang = '';
  continuous = false;
  interimResults = false;
  started = 0;
  stopped = 0;
  /** Set to throw from `start()`, mimicking a browser that refuses. */
  startError: Error | undefined;

  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start(): void {
    if (this.startError !== undefined) throw this.startError;
    this.started++;
    this.onstart?.();
  }

  stop(): void {
    this.stopped++;
    this.onend?.();
  }

  /** Deliver a transcript, as the recogniser would. */
  emitResult(transcript: string, isFinal = true): void {
    this.onresult?.({
      resultIndex: 0,
      results: [{ isFinal, 0: { transcript } }],
    });
  }

  emitError(error: string): void {
    this.onerror?.({ error });
  }
}

function useFakeRecognition(): void {
  FakeRecognition.instances = [];
  (window as unknown as Record<string, unknown>)['SpeechRecognition'] = FakeRecognition;
}

function handlers() {
  return {
    onCommand: vi.fn(),
    onUnrecognised: vi.fn(),
    onError: vi.fn(),
    onListeningChange: vi.fn(),
  };
}

/** The recogniser the controller under test created. */
function latest(): FakeRecognition {
  const instance = FakeRecognition.instances.at(-1);
  if (instance === undefined) throw new Error('no recogniser was constructed');
  return instance;
}

describe('isVoiceSupported', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['SpeechRecognition'];
    delete (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'];
  });

  it('is false when the browser offers neither spelling', () => {
    expect(isVoiceSupported()).toBe(false);
  });

  it('accepts the standard name', () => {
    (window as unknown as Record<string, unknown>)['SpeechRecognition'] = FakeRecognition;
    expect(isVoiceSupported()).toBe(true);
  });

  it('accepts the webkit-prefixed name, which is what ships today', () => {
    (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'] = FakeRecognition;
    expect(isVoiceSupported()).toBe(true);
  });
});

describe('SpeechController', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['SpeechRecognition'];
    vi.useRealTimers();
  });

  describe('without browser support', () => {
    it('reports itself unsupported and stays inert', () => {
      const spies = handlers();
      const controller = new SpeechController(spies);

      expect(controller.supported).toBe(false);
      /* Every method must be safe to call, because the UI wires them up before
         it knows whether the browser can do this. */
      expect(() => {
        controller.begin();
        controller.end();
        controller.setLanguage('de-DE');
      }).not.toThrow();
      expect(spies.onError).not.toHaveBeenCalled();
    });
  });

  describe('with browser support', () => {
    it('configures the recogniser for continuous listening', () => {
      useFakeRecognition();
      const controller = new SpeechController(handlers());

      expect(controller.supported).toBe(true);
      expect(latest().continuous).toBe(true);
      expect(latest().interimResults).toBe(true);
    });

    it('reports when it starts and stops listening', () => {
      useFakeRecognition();
      const spies = handlers();
      const controller = new SpeechController(spies);

      controller.begin();
      expect(spies.onListeningChange).toHaveBeenLastCalledWith(true);

      controller.end();
      expect(spies.onListeningChange).toHaveBeenLastCalledWith(false);
    });

    it('does not start twice while already listening', () => {
      useFakeRecognition();
      const controller = new SpeechController(handlers());

      controller.begin();
      controller.begin();
      expect(latest().started).toBe(1);
    });

    it('ignores end() when it was never listening', () => {
      useFakeRecognition();
      new SpeechController(handlers()).end();
      expect(latest().stopped).toBe(0);
    });

    it('treats InvalidStateError from start() as harmless', () => {
      useFakeRecognition();
      const spies = handlers();
      const controller = new SpeechController(spies);

      const error = new Error('already started');
      error.name = 'InvalidStateError';
      latest().startError = error;

      controller.begin();
      /* It only means we were already listening; the user needs no warning. */
      expect(spies.onError).not.toHaveBeenCalled();
    });

    it('reports any other failure to start as a microphone problem', () => {
      useFakeRecognition();
      const spies = handlers();
      const controller = new SpeechController(spies);
      latest().startError = new Error('device busy');

      controller.begin();
      expect(spies.onError).toHaveBeenCalledWith('audio-capture');
    });

    it('passes the recogniser errors through', () => {
      useFakeRecognition();
      const spies = handlers();
      new SpeechController(spies);

      latest().emitError('not-allowed');
      expect(spies.onError).toHaveBeenCalledWith('not-allowed');
      expect(spies.onListeningChange).toHaveBeenLastCalledWith(false);
    });

    it('sets the language, stopping first if it is mid-listen', () => {
      useFakeRecognition();
      const controller = new SpeechController(handlers());

      controller.setLanguage('en-US');
      expect(latest().lang).toBe('en-US');
      expect(latest().stopped).toBe(0);

      controller.begin();
      controller.setLanguage('de-DE');
      /* Changing language mid-stream needs a restart to take effect. */
      expect(latest().stopped).toBe(1);
      expect(latest().lang).toBe('de-DE');
    });

    it('reports a recognised command', () => {
      useFakeRecognition();
      const spies = handlers();
      new SpeechController(spies);

      latest().emitResult('new entry');
      expect(spies.onCommand).toHaveBeenCalledWith({ kind: 'newEntry' });
    });

    it('reports a phrase it does not know', () => {
      useFakeRecognition();
      const spies = handlers();
      new SpeechController(spies);

      latest().emitResult('what is the weather like');
      expect(spies.onUnrecognised).toHaveBeenCalledTimes(1);
      expect(spies.onCommand).not.toHaveBeenCalled();
    });

    it('ignores interim results, acting only on the final transcript', () => {
      useFakeRecognition();
      const spies = handlers();
      new SpeechController(spies);

      latest().emitResult('start', false);
      expect(spies.onCommand).not.toHaveBeenCalled();

      latest().emitResult('start', true);
      expect(spies.onCommand).toHaveBeenCalledWith({ kind: 'start' });
    });

    it('ignores an empty transcript', () => {
      useFakeRecognition();
      const spies = handlers();
      new SpeechController(spies);

      latest().emitResult('   ');
      expect(spies.onCommand).not.toHaveBeenCalled();
      expect(spies.onUnrecognised).not.toHaveBeenCalled();
    });

    it('debounces a phrase the recogniser delivers twice', () => {
      vi.useFakeTimers();
      useFakeRecognition();
      const spies = handlers();
      new SpeechController(spies);

      latest().emitResult('stop');
      latest().emitResult('stop');
      expect(spies.onCommand).toHaveBeenCalledTimes(1);

      /* Past the debounce window it is taken as a fresh utterance. */
      vi.advanceTimersByTime(400);
      latest().emitResult('stop');
      expect(spies.onCommand).toHaveBeenCalledTimes(2);
    });
  });
});
