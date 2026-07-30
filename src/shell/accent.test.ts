import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, DEFAULT_ACCENT } from '../config/accent.js';
import { derivePalette } from '../core/color.js';
import { en } from '../i18n/en.js';
import { accent, setAccent } from './accent.js';

describe('accent presets', () => {
  it('offer distinct colours under distinct ids', () => {
    expect(new Set(ACCENT_PRESETS.map((preset) => preset.id)).size).toBe(ACCENT_PRESETS.length);
    expect(new Set(ACCENT_PRESETS.map((preset) => preset.seed)).size).toBe(ACCENT_PRESETS.length);
  });

  it('are all named in the message catalogue', () => {
    for (const preset of ACCENT_PRESETS) {
      expect(en[preset.label], preset.id).toBeTruthy();
    }
  });

  it('include the default, so the picker can show it as selected', () => {
    expect(ACCENT_PRESETS.map((preset) => preset.seed)).toContain(DEFAULT_ACCENT);
  });
});

describe('setAccent', () => {
  it('stores the chosen colour and writes the derived palette onto the root element', () => {
    setAccent('#e11d48');

    expect(accent()).toBe('#e11d48');
    expect(localStorage.getItem('dwt:accent')).toBe('"#e11d48"');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
      derivePalette('#e11d48', 'light').accent,
    );
  });

  it('normalises the case, so the picker still recognises a preset as selected', () => {
    setAccent('#0D9488');
    expect(accent()).toBe('#0d9488');
  });

  it('ignores a value that is not a colour rather than writing it into a style', () => {
    /* The seed reaches `style.setProperty`, and the stored one may have been
       edited by hand. Rejecting it here is what keeps that a dead end. */
    setAccent('#2563eb');
    setAccent('red; background: url(nonsense)');

    expect(accent()).toBe('#2563eb');
  });

  it('can preview without persisting, for a colour picker being dragged', () => {
    setAccent('#2563eb');
    setAccent('#d97706', { persist: false });

    expect(accent()).toBe('#d97706');
    expect(localStorage.getItem('dwt:accent')).toBe('"#2563eb"');
  });
});
