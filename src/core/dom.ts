/**
 * DOM construction helpers.
 *
 * Every element on this site is built here, through `createElement` and
 * `textContent`. Nothing assigns `innerHTML`, which is what makes the
 * `require-trusted-types-for 'script'` directive in the Content Security Policy
 * enforceable rather than aspirational: there is no sink for an injected string
 * to reach. ESLint bans the sinks at author time; the CSP catches anything that
 * would somehow get past it at run time.
 *
 * The practical consequence for callers is that user text — a time-tracking
 * comment, a saved-game label — is *data*, always, with no escaping step to get
 * wrong. The old `escapeAttribute` helper escaped `&` last and so double-encoded
 * its own output; a bug of that shape cannot be expressed with this API.
 */

export type Child = Node | string | number | false | null | undefined;

type EventHandlers = {
  [E in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[E]) => void;
};

export interface ElementOptions {
  /** Class names. Falsy entries are dropped, so conditionals stay inline. */
  readonly class?: string | readonly (string | false | null | undefined)[];
  /** Text content. Set as `textContent`, never parsed as markup. */
  readonly text?: string | number;
  readonly id?: string;
  /**
   * Attributes. `true` renders a bare attribute, `false`/`undefined` removes it,
   * which matches how `disabled`, `hidden` and the `aria-*` family behave.
   */
  readonly attrs?: Readonly<Record<string, string | number | boolean | undefined>>;
  /** `data-*` attributes, given without the prefix. */
  readonly data?: Readonly<Record<string, string | number>>;
  readonly on?: EventHandlers;
  readonly children?: readonly Child[];
}

/** Build an element. The return type follows the tag name. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  ...children: readonly Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (options.id !== undefined) node.id = options.id;

  if (options.class !== undefined) {
    const names =
      typeof options.class === 'string'
        ? [options.class]
        : options.class.filter((name): name is string => typeof name === 'string' && name !== '');
    if (names.length > 0) node.classList.add(...names.flatMap((name) => name.split(' ')));
  }

  if (options.text !== undefined) node.textContent = String(options.text);

  if (options.attrs !== undefined) {
    for (const [name, value] of Object.entries(options.attrs)) {
      setAttr(node, name, value);
    }
  }

  if (options.data !== undefined) {
    for (const [name, value] of Object.entries(options.data)) {
      node.dataset[name] = String(value);
    }
  }

  if (options.on !== undefined) {
    for (const [type, handler] of Object.entries(options.on)) {
      node.addEventListener(type, handler as EventListener);
    }
  }

  append(node, ...(options.children ?? []), ...children);
  return node;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Build an SVG element.
 *
 * Separate from `el` because SVG elements live in their own namespace and
 * `createElement` would produce an `HTMLUnknownElement` that renders as nothing.
 * It is still `createElementNS` plus `setAttribute`, so it inherits the same
 * guarantee as everything else here: no string is ever parsed as markup, and the
 * Trusted Types policy has nothing to catch.
 */
export function svgEl(
  tag: string,
  attrs: Readonly<Record<string, string | number>> = {},
  ...children: readonly Element[]
): SVGElement {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attrs)) {
    node.setAttribute(name, String(value));
  }
  node.append(...children);
  return node;
}

/** Set or remove a single attribute, following the `true`/`false` convention above. */
function setAttr(node: Element, name: string, value: string | number | boolean | undefined): void {
  if (value === undefined || value === false) {
    node.removeAttribute(name);
  } else if (value === true) {
    node.setAttribute(name, '');
  } else {
    node.setAttribute(name, String(value));
  }
}

/** Append children, skipping the falsy ones so conditionals read naturally. */
export function append(parent: Node, ...children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

/** Remove every child of a node. */
export function clear(node: Node): void {
  (node as ParentNode).replaceChildren();
}

/** Replace a node's children in one operation. */
export function replaceChildren(parent: ParentNode, ...children: readonly Child[]): void {
  parent.replaceChildren();
  append(parent, ...children);
}

/**
 * Find an element that the page is required to contain.
 *
 * A missing hook here means the markup and the module have drifted apart — a
 * programmer error, not a runtime condition — so this throws with the selector
 * rather than handing back `null` for the caller to trip over three frames later.
 */
/* The caller-supplied element type is an assertion, exactly as it is in the DOM's
   own `querySelector<T>`: a selector string carries no information a type system
   could use to prove which element it will match. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function requireElement<E extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): E {
  const found = root.querySelector<E>(selector);
  if (found === null) {
    throw new Error(`Required element "${selector}" is missing from the document.`);
  }
  return found;
}

/** All matches for a selector, as a real array. */
export function queryAll<E extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): E[] {
  return Array.from(root.querySelectorAll<E>(selector));
}

/**
 * Delegated event listener.
 *
 * Lists here are re-rendered wholesale, so binding to each row would mean
 * rebinding on every change. Listening once on the container and matching on the
 * way up keeps handler count constant and removes a whole class of leak.
 */
export function delegate<K extends keyof HTMLElementEventMap>(
  root: HTMLElement,
  type: K,
  selector: string,
  handler: (event: HTMLElementEventMap[K], target: HTMLElement) => void,
  options?: AddEventListenerOptions,
): void {
  root.addEventListener(
    type,
    (event) => {
      const origin = event.target;
      if (!(origin instanceof Element)) return;
      const match = origin.closest<HTMLElement>(selector);
      if (match !== null && root.contains(match)) handler(event, match);
    },
    options,
  );
}

/** Run `fn` once the document is parsed, immediately if it already is. */
export function onReady(fn: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}
