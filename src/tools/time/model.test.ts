import { describe, expect, it, vi } from 'vitest';
import {
  createCommentStore,
  createDecimalPreferenceStore,
  createEntry,
  createEntryStore,
  elapsedOf,
  heartbeat,
  MAX_COMMENT_LENGTH,
  MAX_COMMENTS,
  MAX_ELAPSED_MS,
  pause,
  recoverInterrupted,
  rememberComment,
  remove,
  reopen,
  runningEntry,
  setComment,
  setElapsed,
  start,
  stop,
  totalElapsed,
  type Entry,
} from './model.js';

const CLOCK = (date: Date): string => date.toISOString().slice(11, 19);
const T0 = Date.UTC(2026, 6, 29, 9, 0, 0);
const minutes = (count: number): number => count * 60_000;

const entryAt = (id: number): Entry => createEntry(id);

describe('elapsedOf', () => {
  it('is zero for a fresh entry', () => {
    expect(elapsedOf(entryAt(T0), T0)).toBe(0);
  });

  it('counts time since the last heartbeat while running', () => {
    const [entry] = start([entryAt(T0)], T0, T0);
    expect(elapsedOf(entry!, T0 + minutes(5))).toBe(minutes(5));
  });

  it('never goes backwards if the clock jumps', () => {
    const [entry] = start([entryAt(T0)], T0, T0);
    expect(elapsedOf(entry!, T0 - minutes(10))).toBe(0);
  });
});

describe('start', () => {
  it('marks the entry active', () => {
    const [entry] = start([entryAt(T0)], T0, T0);
    expect(entry?.active).toEqual({ startedAt: T0, countedTo: T0 });
  });

  it('refuses to run two timers at once', () => {
    const entries = [entryAt(1), entryAt(2)];
    const afterFirst = start(entries, 1, T0);
    const afterSecond = start(afterFirst, 2, T0 + 1000);

    expect(runningEntry(afterSecond)?.id).toBe(1);
    expect(afterSecond.find((entry) => entry.id === 2)?.active).toBeNull();
  });

  it('will not restart a stopped entry', () => {
    const stopped = stop([entryAt(T0)], T0, CLOCK, T0);
    expect(start(stopped, T0, T0 + 1000)[0]?.active).toBeNull();
  });

  it('is a no-op for an entry that is already running', () => {
    const running = start([entryAt(T0)], T0, T0);
    expect(start(running, T0, T0 + minutes(5))[0]?.active?.startedAt).toBe(T0);
  });
});

describe('pause', () => {
  it('banks the elapsed time and records a session', () => {
    const running = start([entryAt(T0)], T0, T0);
    const [paused] = pause(running, T0, CLOCK, T0 + minutes(30));

    expect(paused?.accumulated).toBe(minutes(30));
    expect(paused?.active).toBeNull();
    expect(paused?.sessions).toEqual([{ from: '09:00:00', to: '09:30:00' }]);
  });

  it('accumulates across several start/pause cycles', () => {
    let entries = [entryAt(T0)];
    entries = start(entries, T0, T0);
    entries = pause(entries, T0, CLOCK, T0 + minutes(10));
    entries = start(entries, T0, T0 + minutes(20));
    entries = pause(entries, T0, CLOCK, T0 + minutes(35));

    expect(entries[0]?.accumulated).toBe(minutes(25));
    expect(entries[0]?.sessions).toHaveLength(2);
  });

  it('does nothing to an entry that is not running', () => {
    const entries = [entryAt(T0)];
    expect(pause(entries, T0, CLOCK, T0 + minutes(5))[0]?.accumulated).toBe(0);
  });
});

describe('stop', () => {
  it('closes the running stretch and marks the entry finished', () => {
    const running = start([entryAt(T0)], T0, T0);
    const [stopped] = stop(running, T0, CLOCK, T0 + minutes(15));

    expect(stopped?.isStopped).toBe(true);
    expect(stopped?.accumulated).toBe(minutes(15));
    expect(stopped?.sessions).toHaveLength(1);
  });

  it('can stop an entry that is merely paused, without adding a session', () => {
    let entries = start([entryAt(T0)], T0, T0);
    entries = pause(entries, T0, CLOCK, T0 + minutes(5));
    entries = stop(entries, T0, CLOCK, T0 + minutes(9));

    expect(entries[0]?.isStopped).toBe(true);
    expect(entries[0]?.accumulated).toBe(minutes(5));
    expect(entries[0]?.sessions).toHaveLength(1);
  });

  it('is idempotent', () => {
    const once = stop([entryAt(T0)], T0, CLOCK, T0);
    expect(stop(once, T0, CLOCK, T0 + minutes(5))).toEqual(once);
  });
});

describe('heartbeat', () => {
  it('banks time without ending the stretch', () => {
    const running = start([entryAt(T0)], T0, T0);
    const [ticked] = heartbeat(running, T0 + 1000);

    expect(ticked?.accumulated).toBe(1000);
    expect(ticked?.active).toEqual({ startedAt: T0, countedTo: T0 + 1000 });
  });

  it('does not double-count across repeated ticks', () => {
    let entries = start([entryAt(T0)], T0, T0);
    for (let tick = 1; tick <= 10; tick++) entries = heartbeat(entries, T0 + tick * 1000);

    expect(entries[0]?.accumulated).toBe(10_000);
    expect(elapsedOf(entries[0]!, T0 + 10_000)).toBe(10_000);
  });

  it('leaves idle entries untouched', () => {
    const entries = [entryAt(T0)];
    expect(heartbeat(entries, T0 + minutes(5))).toEqual(entries);
  });
});

describe('recoverInterrupted', () => {
  it('closes a timer left running when the tab was closed, at the last heartbeat', () => {
    /* The regression test for version 2.0's overnight bug: it stored only the
       start time and computed `now - start` on load, so a laptop closed at 17:00
       and reopened at 09:00 credited the entry with sixteen hours. */
    let entries = start([entryAt(T0)], T0, T0);
    entries = heartbeat(entries, T0 + minutes(90)); // page was alive until 10:30
    const recovered = recoverInterrupted(entries, CLOCK);

    expect(recovered[0]?.accumulated).toBe(minutes(90));
    expect(recovered[0]?.active).toBeNull();
    expect(recovered[0]?.sessions).toEqual([{ from: '09:00:00', to: '10:30:00' }]);
  });

  it('leaves entries that were not running alone', () => {
    const entries = [entryAt(T0)];
    expect(recoverInterrupted(entries, CLOCK)).toEqual(entries);
  });
});

describe('totalElapsed', () => {
  it('sums every entry, including the running one', () => {
    let entries = [entryAt(1), entryAt(2)];
    entries = start(entries, 1, T0);
    entries = pause(entries, 1, CLOCK, T0 + minutes(20));
    entries = start(entries, 2, T0 + minutes(20));

    expect(totalElapsed(entries, T0 + minutes(30))).toBe(minutes(30));
  });

  it('is zero for no entries', () => {
    expect(totalElapsed([], T0)).toBe(0);
  });
});

describe('setComment and remove', () => {
  it('sets a comment on an open entry', () => {
    expect(setComment([entryAt(T0)], T0, 'Client call')[0]?.comment).toBe('Client call');
  });

  it('sets a comment on a finished entry, which versions 1.0 and 2.0 refused', () => {
    /* Stopping used to lock the comment for good. Writing down what a stretch of
       work was about is something people do once it is over, so that lock was
       the sharpest edge this tool had. */
    const stopped = stop([entryAt(T0)], T0, CLOCK, T0);
    expect(setComment(stopped, T0, 'Client call')[0]?.comment).toBe('Client call');
  });

  it('truncates an over-long comment rather than storing it', () => {
    const long = 'x'.repeat(MAX_COMMENT_LENGTH + 100);
    expect(setComment([entryAt(T0)], T0, long)[0]?.comment).toHaveLength(MAX_COMMENT_LENGTH);
  });

  it('removes an entry by id', () => {
    expect(remove([entryAt(1), entryAt(2)], 1).map((entry) => entry.id)).toEqual([2]);
  });
});

describe('setElapsed', () => {
  const finished = (elapsedMs: number): Entry[] => {
    const started = start([entryAt(T0)], T0, T0);
    return stop(started, T0, CLOCK, T0 + elapsedMs);
  };

  it('corrects the total of a finished entry, for a timer left running through lunch', () => {
    const corrected = setElapsed(finished(minutes(300)), T0, minutes(45));
    expect(corrected[0]?.accumulated).toBe(minutes(45));
  });

  it('keeps the recorded sessions, which are the evidence of what actually happened', () => {
    const corrected = setElapsed(finished(minutes(300)), T0, minutes(45));
    expect(corrected[0]?.sessions).toHaveLength(1);
  });

  it('refuses to rewrite a running entry, whose total the next heartbeat owns', () => {
    const running = start([entryAt(T0)], T0, T0);
    expect(setElapsed(running, T0, minutes(45))[0]?.accumulated).toBe(0);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, MAX_ELAPSED_MS + 1])(
    'refuses %s rather than storing it',
    (value) => {
      const before = finished(minutes(10));
      expect(setElapsed(before, T0, value)[0]?.accumulated).toBe(minutes(10));
    },
  );
});

describe('reopen', () => {
  it('makes a finished entry writable again, so a mis-clicked Stop is recoverable', () => {
    const stopped = stop(start([entryAt(T0)], T0, T0), T0, CLOCK, T0 + minutes(30));
    const reopened = reopen(stopped, T0);

    expect(reopened[0]?.isStopped).toBe(false);
    /* Reopening is not a reset: the banked time and the session stay. */
    expect(reopened[0]?.accumulated).toBe(minutes(30));
    expect(reopened[0]?.sessions).toHaveLength(1);
  });

  it('can then be started again', () => {
    const reopened = reopen(stop([entryAt(T0)], T0, CLOCK, T0), T0);
    expect(start(reopened, T0, T0)[0]?.active).not.toBeNull();
  });

  it('leaves an entry that was never stopped alone', () => {
    expect(reopen([entryAt(T0)], T0)[0]?.isStopped).toBe(false);
  });
});

describe('rememberComment', () => {
  it('appends new comments', () => {
    expect(rememberComment([], 'a')).toEqual(['a']);
  });

  it('moves a repeated comment to the end rather than duplicating it', () => {
    expect(rememberComment(['a', 'b'], 'a')).toEqual(['b', 'a']);
  });

  it('ignores blank input', () => {
    expect(rememberComment(['a'], '   ')).toEqual(['a']);
  });

  it('caps the list so it cannot grow without bound', () => {
    let comments: string[] = [];
    for (let index = 0; index < MAX_COMMENTS + 50; index++) {
      comments = rememberComment(comments, `comment ${String(index)}`);
    }
    expect(comments).toHaveLength(MAX_COMMENTS);
    expect(comments.at(-1)).toBe(`comment ${String(MAX_COMMENTS + 49)}`);
  });
});

describe('persistence', () => {
  it('round-trips entries', () => {
    const store = createEntryStore();
    const entries = stop(start([entryAt(T0)], T0, T0), T0, CLOCK, T0 + minutes(5));
    store.write(entries);

    expect(createEntryStore().read()).toEqual(entries);
  });

  it('drops only the unreadable entries, keeping the rest of the day', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem(
      'dwt:time.entries',
      JSON.stringify([entryAt(1), { id: 'not a number' }, entryAt(3)]),
    );

    expect(
      createEntryStore()
        .read()
        .map((entry) => entry.id),
    ).toEqual([1, 3]);
  });

  it('migrates version 2.0 entries, converting the German date to ISO', () => {
    localStorage.setItem(
      'timeTrackerEntriesV2',
      JSON.stringify([
        {
          id: 1,
          date: '29.07.26',
          comment: 'Legacy',
          accumulated: 60_000,
          runningSince: null,
          isStopped: true,
          sessions: [{ from: '09:00:00', to: '09:01:00' }],
        },
      ]),
    );

    const [entry] = createEntryStore().read();
    expect(entry).toMatchObject({
      id: 1,
      date: '2026-07-29',
      comment: 'Legacy',
      accumulated: 60_000,
      isStopped: true,
      active: null,
    });
  });

  it('does not credit a legacy running timer with the time since it was saved', () => {
    localStorage.setItem(
      'timeTrackerEntriesV2',
      JSON.stringify([{ id: 1, date: '29.07.26', accumulated: 5_000, runningSince: 1 }]),
    );

    expect(createEntryStore().read()[0]?.accumulated).toBe(5_000);
    expect(createEntryStore().read()[0]?.active).toBeNull();
  });

  it('migrates the shared comments key from 1.0 and 2.0', () => {
    localStorage.setItem('comments', JSON.stringify(['Kundengespräch', 'Meeting']));
    expect(createCommentStore().read()).toEqual(['Kundengespräch', 'Meeting']);
  });

  it('migrates the 2.0 decimal preference, which was stored as the number 1', () => {
    localStorage.setItem('timeTrackerDecimal', '1');
    expect(createDecimalPreferenceStore().read()).toBe(true);
  });

  it('defaults the decimal preference to false', () => {
    expect(createDecimalPreferenceStore().read()).toBe(false);
  });
});
