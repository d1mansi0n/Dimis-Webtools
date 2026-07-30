/**
 * Translation lookup and locale selection.
 *
 * The previous version of these tools mixed German and English inside single
 * pages — a German hub linking to an English converter, a German Sudoku UI with
 * English code. Strings now live only in `en.ts` and `de.ts`, and `en.ts` doubles
 * as the type that `de.ts` must satisfy, so the two cannot drift apart without
 * the build failing.
 */

import { defineStore } from '../core/storage.js';
import { literals } from '../core/schema.js';
import { de } from './de.js';
import { en, type Messages, type TranslationKey } from './en.js';

export type { TranslationKey } from './en.js';

export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

const CATALOGUES: Readonly<Record<Locale, Messages>> = { de, en };

/**
 * Full BCP 47 tags used for `Intl` formatting.
 *
 * Chosen explicitly rather than passing the bare language subtag: plain `'en'`
 * resolves to US conventions in most engines, which would render dates as
 * `7/29/2026` for an audience that reads day-first everywhere else on the site.
 */
const INTL_TAGS: Readonly<Record<Locale, string>> = { de: 'de-DE', en: 'en-GB' };

const DEFAULT_LOCALE: Locale = 'en';

const localeDecoder = literals(...LOCALES);

const preference = defineStore<Locale | null>({
  key: 'locale',
  decoder: (input, path) =>
    input === null ? { ok: true, value: null } : localeDecoder(input, path),
  fallback: () => null,
});

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Pick a locale from the browser's ordered language preferences, matching on the
 * primary subtag so `de-AT` and `de-CH` both resolve to German.
 */
function detectFromBrowser(): Locale {
  const candidates = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  for (const candidate of candidates) {
    const primary = candidate.split('-')[0]?.toLowerCase();
    if (primary !== undefined && isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

let active: Locale = preference.read() ?? detectFromBrowser();

/** The locale currently in effect. */
export function locale(): Locale {
  return active;
}

/** The BCP 47 tag to hand to `Intl` for the active locale. */
export function intlTag(): string {
  return INTL_TAGS[active];
}

/**
 * Switch language and remember the choice.
 *
 * Only the state is changed here. Re-rendering is the caller's business, which
 * keeps this module free of DOM concerns and lets tests switch locale without a
 * page reload.
 */
export function setLocale(next: Locale): void {
  active = next;
  /* A failed write costs the user their preference on the next visit and
     nothing more, so it is deliberately not surfaced. */
  void preference.write(next);
  applyDocumentLanguage();
}

/** Mirror the active locale onto `<html lang>` for screen readers and hyphenation. */
export function applyDocumentLanguage(): void {
  document.documentElement.lang = active;
}

/**
 * Look up a message, substituting `{placeholder}` values.
 *
 * The key type comes from `en.ts`, so a typo is a compile error and the lookup
 * cannot miss at run time.
 */
export function t(key: TranslationKey, params?: Readonly<Record<string, string | number>>): string {
  const template = CATALOGUES[active][key];
  return params === undefined ? template : interpolate(template, params);
}

/**
 * Look up a plural message.
 *
 * `base` names a group of keys suffixed with a CLDR plural category, e.g.
 * `counter.markers.one` and `counter.markers.other`. `Intl.PluralRules` picks
 * the category, which is why this cannot be done with a ternary: German and
 * English happen to agree, but the mechanism should not have to change when a
 * language that does not is added.
 */
export function plural(
  base: string,
  count: number,
  params?: Readonly<Record<string, string | number>>,
): string {
  const category = new Intl.PluralRules(INTL_TAGS[active]).select(count);
  const catalogue = CATALOGUES[active] as Readonly<Record<string, string | undefined>>;
  const template = catalogue[`${base}.${category}`] ?? catalogue[`${base}.other`];
  if (template === undefined) {
    throw new Error(`No plural forms defined for "${base}".`);
  }
  return interpolate(template, { count, ...params });
}

function interpolate(template: string, params: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/** Test seam: restore the module to a known locale without touching storage. */
export function setLocaleForTesting(next: Locale): void {
  active = next;
}
