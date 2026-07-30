import { beforeEach } from 'vitest';
import { resetStorageForTesting } from '../core/storage.js';

/**
 * Persistence is global state, so every test starts from an empty, freshly
 * probed store. Without the reset, the first test to run would pin the backing
 * store for the whole file and the fallback path could never be exercised.
 */
beforeEach(() => {
  /* Suites that ask for the node environment — the ones asserting about files on
     disk — have neither storage nor a document to reset. */
  if (typeof localStorage === 'undefined') return;

  localStorage.clear();
  resetStorageForTesting();
  document.body.replaceChildren();
});
