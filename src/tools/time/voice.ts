/**
 * Voice control.
 *
 * `parseCommand` is a pure function over a transcript, so the whole command
 * vocabulary is testable without a microphone. `SpeechController` is the thin
 * wrapper around the browser API that the DOM layer talks to.
 */

/** Languages the recogniser is offered in, matching the tool's own locales. */
export const VOICE_LANGUAGES = ['en-US', 'de-DE'] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

export type Command =
  | { readonly kind: 'newEntry' }
  | { readonly kind: 'start' }
  | { readonly kind: 'pause' }
  | { readonly kind: 'stop' }
  | { readonly kind: 'comment'; readonly text: string };

/**
 * Command vocabulary, in both supported languages at once.
 *
 * Both are always active rather than being switched with the recogniser's
 * language, because someone speaking German to a browser set to English is a
 * far more likely mistake than a genuine collision between the word lists.
 */
const VOCABULARY = {
  newEntry: ['new entry', 'neuer eintrag', 'eintrag hinzufügen'],
  start: ['start', 'begin', 'los', 'anfangen', 'timer starten', 'starte timer'],
  pause: ['pause', 'anhalten', 'unterbrechen', 'pausieren', 'timer pausieren'],
  stop: ['stop', 'stopp', 'beenden', 'ende', 'timer stoppen'],
  comment: ['comment', 'kommentar', 'notiz'],
} as const;

/**
 * Reduce a transcript to comparable words: lower case, punctuation removed,
 * whitespace collapsed. `\p{L}` keeps letters from any script, so umlauts
 * survive.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\d\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escape a phrase for use inside a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a whole-phrase matcher that tolerates variable spacing between words. */
function phrasePattern(phrase: string): RegExp {
  const words = phrase.split(/\s+/).map(escapeRegExp).join('\\s+');
  return new RegExp(`\\b${words}\\b`, 'iu');
}

/* Compiled once at module load rather than on every utterance. */
const PATTERNS = {
  newEntry: VOCABULARY.newEntry.map(phrasePattern),
  start: VOCABULARY.start.map(phrasePattern),
  pause: VOCABULARY.pause.map(phrasePattern),
  stop: VOCABULARY.stop.map(phrasePattern),
  comment: VOCABULARY.comment.map(phrasePattern),
} as const;

const matches = (text: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(text));

/**
 * Interpret a spoken phrase.
 *
 * Order matters and mirrors what people actually say. "New entry" is checked
 * first because it is the only command that does not need an existing entry.
 * "Comment" is checked before the timer verbs so that dictating
 * "comment stop by the office" records the text rather than stopping the timer.
 */
export function parseCommand(transcript: string): Command | undefined {
  const text = normalise(transcript);
  if (text === '') return undefined;

  if (matches(text, PATTERNS.newEntry)) return { kind: 'newEntry' };

  if (matches(text, PATTERNS.comment)) {
    let remainder = text;
    for (const pattern of PATTERNS.comment) {
      remainder = remainder.replace(new RegExp(pattern.source, 'giu'), ' ');
    }
    const cleaned = remainder.replace(/\s+/g, ' ').trim();
    return { kind: 'comment', text: cleaned };
  }

  if (matches(text, PATTERNS.start)) return { kind: 'start' };
  if (matches(text, PATTERNS.pause)) return { kind: 'pause' };
  if (matches(text, PATTERNS.stop)) return { kind: 'stop' };

  return undefined;
}

/* ------------------------------------------------------- browser wrapper */

/**
 * The Web Speech API is not in the standard DOM typings and is prefixed in the
 * browsers that implement it, so the small surface actually used is declared
 * here rather than pulling in a dependency for it.
 */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
}

interface SpeechResultEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<{ readonly isFinal: boolean; readonly 0: { transcript: string } }>;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function speechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/** True when this browser can do speech recognition at all. */
export function isVoiceSupported(): boolean {
  return speechRecognitionConstructor() !== undefined;
}

export interface SpeechHandlers {
  readonly onCommand: (command: Command) => void;
  readonly onUnrecognised: () => void;
  readonly onError: (error: string) => void;
  readonly onListeningChange: (listening: boolean) => void;
}

/** Debounce window: recognisers often deliver the same phrase twice in a row. */
const COMMAND_DEBOUNCE_MS = 300;

export class SpeechController {
  private recognition: SpeechRecognitionLike | undefined;
  private listening = false;
  private lastCommandAt = 0;

  constructor(private readonly handlers: SpeechHandlers) {
    const Recognition = speechRecognitionConstructor();
    if (Recognition === undefined) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      this.listening = true;
      handlers.onListeningChange(true);
    };
    recognition.onend = () => {
      this.listening = false;
      handlers.onListeningChange(false);
    };
    recognition.onerror = (event) => {
      this.listening = false;
      handlers.onListeningChange(false);
      handlers.onError(event.error);
    };
    recognition.onresult = (event) => {
      this.handleResult(event);
    };
    this.recognition = recognition;
  }

  get supported(): boolean {
    return this.recognition !== undefined;
  }

  setLanguage(language: string): void {
    if (this.recognition === undefined) return;
    if (this.listening) this.recognition.stop();
    this.recognition.lang = language;
  }

  begin(): void {
    if (this.recognition === undefined || this.listening) return;
    try {
      this.recognition.start();
    } catch (cause) {
      /* Calling start() twice throws InvalidStateError, which is harmless and
         means we are already listening. Anything else is worth reporting. */
      if (!(cause instanceof Error) || cause.name !== 'InvalidStateError') {
        this.handlers.onError('audio-capture');
      }
    }
  }

  end(): void {
    if (this.recognition !== undefined && this.listening) this.recognition.stop();
  }

  private handleResult(event: SpeechResultEvent): void {
    let transcript = '';
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index];
      if (result?.isFinal === true) transcript += result[0].transcript;
    }
    if (transcript.trim() === '') return;

    const now = Date.now();
    if (now - this.lastCommandAt < COMMAND_DEBOUNCE_MS) return;
    this.lastCommandAt = now;

    const command = parseCommand(transcript);
    if (command === undefined) this.handlers.onUnrecognised();
    else this.handlers.onCommand(command);
  }
}
