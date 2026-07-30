import { describe, expect, it, vi } from 'vitest';
import {
  append,
  clear,
  delegate,
  el,
  onReady,
  queryAll,
  replaceChildren,
  requireElement,
} from './dom.js';

describe('el', () => {
  it('creates an element with the type implied by the tag', () => {
    const input = el('input', { attrs: { type: 'number' } });
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input.type).toBe('number');
  });

  it('sets text as text, never as markup', () => {
    const node = el('p', { text: '<img src=x onerror=alert(1)>' });
    expect(node.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(node.children).toHaveLength(0);
  });

  it('keeps user text inert even when it looks like a script tag', () => {
    const node = el('span', {}, '</span><script>alert(1)</script>');
    expect(node.querySelector('script')).toBeNull();
    expect(node.textContent).toBe('</span><script>alert(1)</script>');
  });

  it('accepts a class string or a list with falsy entries dropped', () => {
    expect(el('div', { class: 'a b' }).className).toBe('a b');
    expect(el('div', { class: ['a', false, undefined, 'b'] }).className).toBe('a b');
  });

  it('renders true as a bare attribute and omits false and undefined', () => {
    const button = el('button', { attrs: { disabled: true, hidden: false, title: undefined } });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.hasAttribute('hidden')).toBe(false);
    expect(button.hasAttribute('title')).toBe(false);
  });

  it('writes data attributes without the prefix', () => {
    expect(el('div', { data: { row: 3 } }).dataset['row']).toBe('3');
  });

  it('attaches listeners', () => {
    const onClick = vi.fn();
    const button = el('button', { on: { click: onClick } });
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('appends children from options and from the rest parameters', () => {
    const node = el('div', { children: [el('span', { text: 'a' })] }, 'b', 7);
    expect(node.textContent).toBe('ab7');
  });

  it('skips null, undefined and false children', () => {
    const node = el('div', {}, 'a', null, undefined, false, 'b');
    expect(node.textContent).toBe('ab');
  });
});

describe('append, clear and replaceChildren', () => {
  it('empties a node', () => {
    const node = el('div', {}, 'a', el('b', { text: 'c' }));
    clear(node);
    expect(node.childNodes).toHaveLength(0);
  });

  it('swaps the children in one call', () => {
    const node = el('div', {}, 'old');
    replaceChildren(node, 'new');
    expect(node.textContent).toBe('new');
  });

  it('appends onto an existing node', () => {
    const node = el('div', {}, 'a');
    append(node, 'b');
    expect(node.textContent).toBe('ab');
  });
});

describe('requireElement', () => {
  it('returns the match', () => {
    document.body.append(el('div', { id: 'target' }));
    expect(requireElement('#target').id).toBe('target');
  });

  it('throws a message naming the selector when the markup has drifted', () => {
    expect(() => requireElement('#missing')).toThrow(/#missing/);
  });

  it('can be scoped to a subtree', () => {
    const root = el('div', {}, el('span', { class: 'x', text: 'inner' }));
    expect(requireElement('.x', root).textContent).toBe('inner');
  });
});

describe('queryAll', () => {
  it('returns a real array', () => {
    const root = el('ul', {}, el('li', {}), el('li', {}));
    const items = queryAll('li', root);
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(2);
  });
});

describe('delegate', () => {
  it('matches events from descendants of the selector', () => {
    const handler = vi.fn();
    const row = el('div', { class: 'row' }, el('button', { class: 'go' }, el('span', {}, 'x')));
    const root = el('div', {}, row);
    document.body.append(root);

    delegate(root, 'click', '.go', handler);
    requireElement('span', root).click();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[1]).toBe(requireElement('.go', root));
  });

  it('ignores events that match nothing', () => {
    const handler = vi.fn();
    const root = el('div', {}, el('button', { class: 'other' }));
    document.body.append(root);

    delegate(root, 'click', '.go', handler);
    requireElement('.other', root).click();

    expect(handler).not.toHaveBeenCalled();
  });

  it('survives re-rendered children, which is the whole point', () => {
    const handler = vi.fn();
    const root = el('div', {});
    document.body.append(root);
    delegate(root, 'click', '.go', handler);

    for (let round = 0; round < 3; round++) {
      replaceChildren(root, el('button', { class: 'go' }));
      requireElement('.go', root).click();
    }

    expect(handler).toHaveBeenCalledTimes(3);
  });
});

describe('onReady', () => {
  it('runs immediately when the document is already parsed', () => {
    const fn = vi.fn();
    onReady(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('waits for DOMContentLoaded while the document is still loading', () => {
    const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const fn = vi.fn();

    onReady(fn);
    expect(fn).not.toHaveBeenCalled();

    readyState.mockRestore();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
