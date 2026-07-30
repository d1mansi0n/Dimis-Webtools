import '../../styles/app.css';
import './time.css';

import { el, requireElement } from '../../core/dom.js';
import {
  formatDuration,
  formatIsoDate,
  formatTimeOfDay,
  toDecimalHours,
  toIsoDate,
} from '../../core/format.js';
import { intlTag, t } from '../../i18n/index.js';
import { boot } from '../../shell/boot.js';
import { confirmDialog } from '../../shell/dialog.js';
import { buildSheet, downloadWorkbook, exportFileName } from './export.js';
import {
  createCommentStore,
  createDecimalPreferenceStore,
  createEntry,
  createEntryStore,
  elapsedOf,
  HEARTBEAT_MS,
  heartbeat,
  pause,
  recoverInterrupted,
  rememberComment,
  remove,
  runningEntry,
  setComment,
  start,
  stop,
  totalElapsed,
  type Entry,
} from './model.js';
import { isVoiceSupported, SpeechController, type Command } from './voice.js';

/** How long the delete button must be held. Matches the CSS fill animation. */
const HOLD_TO_DELETE_MS = 1000;

/**
 * Heartbeats between writes to storage.
 *
 * Writing every second would be wasteful for no benefit; the cost of batching is
 * that a tab closed mid-interval loses up to this much of the running stretch.
 */
const PERSIST_EVERY_TICKS = 5;

boot({
  start() {
    const entryStore = createEntryStore();
    const commentStore = createCommentStore();
    const decimalStore = createDecimalPreferenceStore();

    let entries = recoverInterrupted(entryStore.read(), formatTimeOfDay);
    let comments = commentStore.read();
    let showDecimal = decimalStore.read();
    let ticksSincePersist = 0;

    /* Persist immediately: recovery may have closed an interrupted stretch, and
       that correction should survive even if the tab is closed again at once. */
    persist();

    /* --------------------------------------------------------------- elements */
    const entriesHost = requireElement('[data-time="entries"]');
    const emptyMessage = requireElement('[data-time="empty"]');
    const totalValue = requireElement('[data-time="total"]');
    const feedback = requireElement('[data-time="feedback"]');
    const formatButton = requireElement<HTMLButtonElement>('[data-time="format"]');
    const voiceButton = requireElement<HTMLButtonElement>('[data-time="voice"]');
    const voiceLanguage = requireElement<HTMLSelectElement>('[data-time="voiceLang"]');
    const commentsList = requireElement('[data-time="commentsList"]');
    const clearCommentsButton = requireElement<HTMLButtonElement>('[data-time="clearComments"]');
    const suggestions = requireElement('#comment-suggestions');

    /* ----------------------------------------------------------------- chrome */
    document.title = `${t('tool.time.name')} · ${t('app.name')}`;
    requireElement('[data-time="title"]').textContent = t('tool.time.name');
    requireElement('[data-time="new"]').textContent = t('time.newEntry');
    requireElement('[data-time="export"]').textContent = t('time.export');
    requireElement('[data-time="clear"]').textContent = t('time.clearAll');
    requireElement('[data-time="totalLabel"]').textContent = t('time.total');
    requireElement('[data-time="toggleComments"]').textContent = t('time.comments.toggle');
    clearCommentsButton.textContent = t('time.comments.clear');
    emptyMessage.textContent = t('time.empty');
    voiceButton.textContent = t('time.voice.push');
    voiceButton.title = t('time.voice.hold');
    voiceLanguage.setAttribute('aria-label', t('time.voice.language'));
    updateFormatButton();

    /* ------------------------------------------------------------ persistence */
    function persist(): void {
      const result = entryStore.write(entries);
      if (!result.ok) {
        say(result.error.kind === 'quota-exceeded' ? t('storage.full') : t('storage.failed'), true);
      }
    }

    function say(message: string, isError = false): void {
      feedback.textContent = message;
      feedback.className = `msg ${isError ? 'msg--err' : 'msg--ok'}`;
    }

    /* --------------------------------------------------------------- rendering
     *
     * Two levels on purpose. `render()` rebuilds the list and runs only after a
     * real change; `tick()` touches nothing but the numbers, once a second.
     * Re-rendering on every tick would blow away the comment field's focus and
     * selection while someone was typing in it.
     */

    interface Row {
      readonly elapsed: HTMLElement;
      readonly sessions: HTMLElement;
      readonly root: HTMLElement;
    }
    let rows = new Map<number, Row>();

    function render(): void {
      emptyMessage.hidden = entries.length > 0;
      rows = new Map();
      entriesHost.replaceChildren(...entries.map(entryRow));
      tick();
    }

    function entryRow(entry: Entry): HTMLElement {
      const running = entry.active !== null;

      const elapsed = el('p', { class: 'time-entry__elapsed' });
      const sessions = el('div', { class: 'time-entry__sessions' });

      const comment = el('input', {
        class: ['input', 'time-entry__comment'],
        attrs: {
          type: 'text',
          value: entry.comment,
          placeholder: t('time.comment.placeholder'),
          list: 'comment-suggestions',
          disabled: entry.isStopped,
          'aria-label': t('time.comment.placeholder'),
        },
        on: {
          input: () => {
            entries = setComment(entries, entry.id, comment.value);
          },
          change: () => {
            entries = setComment(entries, entry.id, comment.value);
            persist();
          },
        },
      });

      const deleteButton = el('button', {
        class: ['btn', 'time-entry__delete'],
        attrs: { type: 'button', title: t('time.delete.hint') },
        text: t('time.delete'),
      });
      attachHoldToDelete(deleteButton, entry.id);

      const root = el(
        'div',
        {
          class: 'time-entry',
          attrs: { 'data-running': running },
        },
        el(
          'div',
          { class: 'time-entry__controls' },
          controlButton(t('time.start'), entry.isStopped || running, () => {
            const before = runningEntry(entries);
            if (before !== undefined && before.id !== entry.id) {
              say(t('time.voice.alreadyRunning'), true);
              return;
            }
            entries = start(entries, entry.id);
            persist();
            render();
          }),
          controlButton(t('time.pause'), entry.isStopped || !running, () => {
            entries = pause(entries, entry.id, formatTimeOfDay);
            persist();
            render();
          }),
          controlButton(t('time.stop'), entry.isStopped, () => {
            entries = stop(entries, entry.id, formatTimeOfDay);
            const stopped = entries.find((candidate) => candidate.id === entry.id);
            if (stopped !== undefined && stopped.comment.trim() !== '') {
              comments = rememberComment(comments, stopped.comment);
              commentStore.write(comments);
              renderSuggestions();
            }
            persist();
            render();
          }),
        ),
        el(
          'div',
          { class: 'time-entry__body' },
          el('p', {
            class: 'time-entry__date',
            text: `${formatIsoDate(entry.date, intlTag())}${entry.isStopped ? ` · ${t('time.finished')}` : ''}`,
          }),
          elapsed,
          sessions,
          comment,
        ),
        deleteButton,
      );

      rows.set(entry.id, { elapsed, sessions, root });
      return root;
    }

    function controlButton(label: string, disabled: boolean, onClick: () => void): HTMLElement {
      return el('button', {
        class: 'btn',
        attrs: { type: 'button', disabled },
        text: label,
        on: { click: onClick },
      });
    }

    /** Update only the numbers. Called every second. */
    function tick(): void {
      const now = Date.now();
      for (const entry of entries) {
        const row = rows.get(entry.id);
        if (row === undefined) continue;

        row.elapsed.textContent = formatElapsed(elapsedOf(entry, now));

        const live =
          entry.active === null
            ? undefined
            : el('div', {
                attrs: { 'data-live': true },
                text: `${formatTimeOfDay(new Date(entry.active.startedAt))} – ${formatTimeOfDay(new Date(now))} (${t('time.running')})`,
              });

        row.sessions.replaceChildren(
          ...(live === undefined ? [] : [live]),
          ...[...entry.sessions]
            .reverse()
            .map((session) => el('div', { text: `${session.from} – ${session.to}` })),
        );
      }
      totalValue.textContent = formatElapsed(totalElapsed(entries, now));
    }

    function formatElapsed(ms: number): string {
      return showDecimal ? `${toDecimalHours(ms).toFixed(2)} h` : formatDuration(ms);
    }

    function updateFormatButton(): void {
      formatButton.textContent = showDecimal ? t('time.showClock') : t('time.showDecimal');
    }

    function renderSuggestions(): void {
      suggestions.replaceChildren(
        ...comments.map((comment) => el('option', { attrs: { value: comment } })),
      );
    }

    function renderStoredComments(): void {
      commentsList.replaceChildren(
        ...(comments.length === 0
          ? [el('p', { class: 'empty', text: t('time.comments.empty') })]
          : comments.map((comment, index) =>
              el(
                'div',
                { class: 'time-comment' },
                el('span', { text: comment }),
                el('button', {
                  class: 'btn',
                  attrs: { type: 'button', 'aria-label': `${t('common.delete')}: ${comment}` },
                  text: '✕',
                  on: {
                    click: () => {
                      comments = comments.filter((_, position) => position !== index);
                      commentStore.write(comments);
                      renderSuggestions();
                      renderStoredComments();
                    },
                  },
                }),
              ),
            )),
      );
    }

    /* ------------------------------------------------------- hold to delete */

    function attachHoldToDelete(button: HTMLElement, id: number): void {
      let timer: number | undefined;

      const cancel = (): void => {
        window.clearTimeout(timer);
        timer = undefined;
        button.removeAttribute('data-holding');
      };

      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setAttribute('data-holding', '');
        timer = window.setTimeout(() => {
          cancel();
          entries = remove(entries, id);
          persist();
          render();
        }, HOLD_TO_DELETE_MS);
      });

      for (const type of ['pointerup', 'pointerleave', 'pointercancel'] as const) {
        button.addEventListener(type, cancel);
      }

      /* Keyboard users cannot "hold" a button, so Enter and Space ask instead.
         Without this the delete action would be unreachable without a pointer. */
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        void confirmDialog({
          message: t('time.confirm.clearEntries'),
          confirmLabel: t('common.delete'),
          destructive: true,
        }).then((confirmed) => {
          if (!confirmed) return;
          entries = remove(entries, id);
          persist();
          render();
        });
      });
    }

    /* --------------------------------------------------------------- toolbar */

    requireElement('[data-time="new"]').addEventListener('click', () => {
      entries = [...entries, createEntry()];
      persist();
      render();
    });

    formatButton.addEventListener('click', () => {
      showDecimal = !showDecimal;
      decimalStore.write(showDecimal);
      updateFormatButton();
      tick();
    });

    requireElement('[data-time="export"]').addEventListener('click', () => {
      if (entries.length === 0) {
        say(t('time.export.empty'), true);
        return;
      }
      const sheet = buildSheet(
        entries,
        {
          sheet: t('time.export.sheet'),
          date: t('time.export.column.date'),
          start: t('time.export.column.start'),
          end: t('time.export.column.end'),
          elapsed: t('time.export.column.elapsed'),
          decimal: t('time.export.column.decimal'),
          comment: t('time.export.column.comment'),
          sessions: t('time.export.column.sessions'),
          total: t('time.export.total'),
        },
        (iso) => formatIsoDate(iso, intlTag()),
      );
      downloadWorkbook(sheet, exportFileName(toIsoDate(new Date())));
      say(t('time.export.done', { count: entries.length }));
    });

    requireElement('[data-time="clear"]').addEventListener('click', () => {
      if (entries.length === 0) return;
      void confirmDialog({
        message: t('time.confirm.clearEntries'),
        confirmLabel: t('common.delete'),
        destructive: true,
      }).then((confirmed) => {
        if (!confirmed) return;
        entries = [];
        entryStore.clear();
        render();
      });
    });

    /* -------------------------------------------------------------- comments */

    requireElement('[data-time="toggleComments"]').addEventListener('click', () => {
      const nowVisible = commentsList.hidden;
      commentsList.hidden = !nowVisible;
      clearCommentsButton.hidden = !nowVisible;
      if (nowVisible) renderStoredComments();
    });

    clearCommentsButton.addEventListener('click', () => {
      void confirmDialog({
        message: t('time.confirm.clearComments'),
        confirmLabel: t('common.delete'),
        destructive: true,
      }).then((confirmed) => {
        if (!confirmed) return;
        comments = [];
        commentStore.clear();
        renderSuggestions();
        renderStoredComments();
      });
    });

    /* ----------------------------------------------------------------- voice */

    if (!isVoiceSupported()) {
      voiceButton.disabled = true;
      voiceLanguage.disabled = true;
      voiceButton.title = t('time.voice.unsupported');
    } else {
      const speech = new SpeechController({
        onCommand: applyVoiceCommand,
        onUnrecognised: () => {
          /* Staying silent here would look like the microphone was not working;
             the phrase simply was not one of ours. */
          say(t('time.voice.noComment'), true);
        },
        onError: (error) => {
          const messages: Record<string, string> = {
            'no-speech': t('time.voice.noSpeech'),
            'audio-capture': t('time.voice.noMic'),
            'not-allowed': t('time.voice.denied'),
          };
          say(messages[error] ?? t('time.voice.error', { error }), true);
        },
        onListeningChange: (listening) => {
          voiceButton.setAttribute('aria-pressed', String(listening));
        },
      });

      speech.setLanguage(voiceLanguage.value);
      voiceLanguage.addEventListener('change', () => {
        speech.setLanguage(voiceLanguage.value);
      });

      voiceButton.addEventListener('pointerdown', () => {
        speech.begin();
      });
      for (const type of ['pointerup', 'pointerleave', 'pointercancel'] as const) {
        voiceButton.addEventListener(type, () => {
          speech.end();
        });
      }
    }

    function applyVoiceCommand(command: Command): void {
      if (command.kind === 'newEntry') {
        entries = [...entries, createEntry()];
        persist();
        render();
        say(t('time.voice.added'));
        return;
      }

      /* Target the running entry, or failing that the most recent open one. */
      const target =
        runningEntry(entries) ?? [...entries].reverse().find((entry) => !entry.isStopped);
      if (target === undefined) {
        say(t('time.voice.noTarget'), true);
        return;
      }

      switch (command.kind) {
        case 'comment':
          if (command.text === '') {
            say(t('time.voice.noComment'), true);
            return;
          }
          entries = setComment(entries, target.id, command.text);
          say(t('time.voice.comment', { text: command.text }));
          break;
        case 'start':
          entries = start(entries, target.id);
          say(t('time.voice.started'));
          break;
        case 'pause':
          entries = pause(entries, target.id, formatTimeOfDay);
          say(t('time.voice.paused'));
          break;
        case 'stop':
          entries = stop(entries, target.id, formatTimeOfDay);
          say(t('time.voice.stopped'));
          break;
      }
      persist();
      render();
    }

    /* ------------------------------------------------------------------ loop */

    window.setInterval(() => {
      if (runningEntry(entries) === undefined) return;
      entries = heartbeat(entries);
      tick();
      if (++ticksSincePersist >= PERSIST_EVERY_TICKS) {
        ticksSincePersist = 0;
        persist();
      }
    }, HEARTBEAT_MS);

    /* A tab being hidden or closed is the last chance to bank the running time. */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;
      entries = heartbeat(entries);
      persist();
    });

    renderSuggestions();
    render();
  },
});
