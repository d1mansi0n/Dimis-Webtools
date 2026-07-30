import { afterEach, describe, expect, it } from 'vitest';
import { de } from './de.js';
import { en } from './en.js';
import { LOCALES, locale, plural, setLocale, setLocaleForTesting, t } from './index.js';

const CATALOGUES = { de, en } as const;

afterEach(() => {
  setLocaleForTesting('en');
});

describe('locale catalogues', () => {
  it('define exactly the same keys', () => {
    /* TypeScript already enforces this through the `Messages` type. Asserting it
       at run time as well guards against a `de.ts` that satisfies the type via a
       cast or an index signature. */
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('leave no message empty', () => {
    for (const [name, catalogue] of Object.entries(CATALOGUES)) {
      for (const [key, value] of Object.entries(catalogue)) {
        expect(value.trim(), `${name}:${key} is empty`).not.toBe('');
      }
    }
  });

  it('use the same placeholders in every language', () => {
    /* A translation that drops `{ratio}` or invents `{amount}` renders a broken
       string only in that language, which is exactly the kind of defect that
       survives review. */
    const placeholders = (value: string): string[] =>
      [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();

    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(de[key]), `placeholders differ for "${key}"`).toEqual(
        placeholders(en[key]),
      );
    }
  });

  it('provide both plural forms for every plural group', () => {
    const groups = new Set(
      Object.keys(en)
        .filter((key) => key.endsWith('.one') || key.endsWith('.other'))
        .map((key) => key.slice(0, key.lastIndexOf('.'))),
    );
    expect(groups.size).toBeGreaterThan(0);
    for (const group of groups) {
      for (const catalogue of Object.values(CATALOGUES)) {
        const messages = catalogue as Record<string, string | undefined>;
        expect(messages[`${group}.one`], `${group}.one`).toBeDefined();
        expect(messages[`${group}.other`], `${group}.other`).toBeDefined();
      }
    }
  });
});

describe('t', () => {
  it('returns the message for the active locale', () => {
    setLocaleForTesting('en');
    expect(t('common.close')).toBe('Close');
    setLocaleForTesting('de');
    expect(t('common.close')).toBe('Schließen');
  });

  it('substitutes placeholders', () => {
    setLocaleForTesting('en');
    expect(t('rice.total', { total: '3.60' })).toBe('Total in the pot: 3.60 cups');
  });

  it('accepts numbers as placeholder values', () => {
    setLocaleForTesting('en');
    expect(t('rice.invalid', { min: 0.1, max: 10 })).toBe('Enter a number between 0.1 and 10.');
  });

  it('leaves an unsupplied placeholder visible rather than printing "undefined"', () => {
    setLocaleForTesting('en');
    expect(t('rice.total', {})).toBe('Total in the pot: {total} cups');
  });
});

describe('plural', () => {
  it('selects the singular and plural forms', () => {
    setLocaleForTesting('en');
    expect(plural('counter.markers', 1)).toBe('1 marker');
    expect(plural('counter.markers', 0)).toBe('0 markers');
    expect(plural('counter.markers', 7)).toBe('7 markers');
  });

  it('works in German too', () => {
    setLocaleForTesting('de');
    expect(plural('counter.markers', 1)).toBe('1 Markierung');
    expect(plural('counter.markers', 2)).toBe('2 Markierungen');
  });

  it('throws for a group that does not exist, rather than rendering nothing', () => {
    expect(() => plural('nope.missing', 1)).toThrow(/nope.missing/);
  });
});

describe('setLocale', () => {
  it('persists the choice and reflects it on the document', () => {
    setLocale('de');
    expect(locale()).toBe('de');
    expect(document.documentElement.lang).toBe('de');
    expect(localStorage.getItem('dwt:locale')).toBe('"de"');
  });

  it('offers exactly the locales it can serve', () => {
    expect([...LOCALES].sort()).toEqual(Object.keys(CATALOGUES).sort());
  });
});
