/**
 * Recipes & Shopping List — domain logic.
 *
 * Two different roundings run through this module, and keeping them apart is the
 * point of it:
 *
 *  - **Cooking amounts** are what a method needs. Half an avocado is half an
 *    avocado, and 60 g of oats for three people is 180 g.
 *  - **Shopping amounts** are what a shop sells. Half an avocado is one avocado,
 *    and grams and millilitres are rounded to something you can weigh out.
 *
 * The previous standalone version used the shopping rounding everywhere, so the
 * ingredient list inside a recipe claimed a whole tin of chickpeas for a portion
 * that needs two thirds of one — and it never scaled that list with the number
 * of people at all, even though the shopping list above it did.
 */

import {
  inRange,
  integer,
  lenientArrayOf,
  literals,
  maxLength,
  objectOf,
  string,
  withDefault,
  type Decoder,
} from '../../core/schema.js';
import { defineStore, type Store } from '../../core/storage.js';
import type { Locale } from '../../i18n/index.js';
import {
  CATEGORY_ORDER,
  INGREDIENTS,
  RECIPES,
  STAPLES,
  type Category,
  type Ingredient,
  type Meal,
  type Recipe,
  type Unit,
} from './data.js';

const MIN_PERSONS = 1;
export const MAX_PERSONS = 6;

/** Most own items kept. Generous for a shop, bounded for storage. */
export const MAX_CUSTOM_ITEMS = 50;
export const MAX_CUSTOM_NAME = 60;
export const MAX_CUSTOM_NOTE = 30;

/** Longest id we will read back from storage; ids in the catalogue are far shorter. */
const MAX_ID_LENGTH = 64;

/** Enough room for every tick on the largest possible list, and no more. */
const MAX_CHECKED = INGREDIENTS.length + STAPLES.length + MAX_CUSTOM_ITEMS;

/** Litres take over from millilitres at this point, as they do on a bottle. */
const ML_PER_LITRE = 1000;

const INGREDIENTS_BY_ID = new Map(INGREDIENTS.map((item) => [item.id, item]));
const RECIPES_BY_ID = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));

/**
 * Look up an ingredient the catalogue is required to contain.
 *
 * A recipe naming an ingredient that does not exist is a typo in `data.ts`, not
 * a runtime condition, so this throws rather than quietly dropping the line and
 * leaving someone to wonder why their curry has no coconut milk. The unit test
 * over the whole catalogue is what stops that reaching a build.
 */
export function ingredientById(id: string): Ingredient {
  const found = INGREDIENTS_BY_ID.get(id);
  if (found === undefined) throw new Error(`Unknown ingredient "${id}".`);
  return found;
}

export function recipesOf(meal: Meal): readonly Recipe[] {
  return RECIPES.filter((recipe) => recipe.meal === meal);
}

/** The chosen recipes, in catalogue order, ignoring ids that are no longer real. */
export function selectedRecipes(ids: Iterable<string>): readonly Recipe[] {
  const wanted = new Set(ids);
  return RECIPES.filter((recipe) => wanted.has(recipe.id));
}

/* ------------------------------------------------------------- quantities */

/** `l` never appears in the catalogue; it only ever comes out of a conversion. */
export type DisplayUnit = Unit | 'l';

export interface Quantity {
  readonly unit: DisplayUnit;
  readonly value: number;
}

/**
 * An amount as the recipe uses it.
 *
 * Weights and volumes go to whole units, countable things to a quarter, so a
 * lemon appears as `0.5` rather than as an eleven-decimal artefact of
 * `0.25 * 3`.
 */
export function cookingQuantity(unit: Unit, amount: number): Quantity {
  switch (unit) {
    case 'g':
      return { unit, value: Math.max(1, Math.round(amount)) };
    case 'ml':
      return amount >= ML_PER_LITRE
        ? { unit: 'l', value: Math.round((amount / ML_PER_LITRE) * 10) / 10 }
        : { unit, value: Math.max(1, Math.round(amount)) };
    case 'piece':
    case 'can':
    case 'bunch':
      return { unit, value: Math.max(0.25, Math.round(amount * 4) / 4) };
  }
}

/**
 * An amount as a shop sells it.
 *
 * Countable things round *up*: two portions needing 0.7 of a tin each is two
 * tins, and coming home with one is the failure mode that matters. Weights and
 * volumes round to the nearest 10, because no one weighs out 187 g.
 */
export function purchaseQuantity(unit: Unit, amount: number): Quantity {
  switch (unit) {
    case 'g':
      return { unit, value: Math.max(10, Math.round(amount / 10) * 10) };
    case 'ml': {
      const rounded = Math.max(10, Math.round(amount / 10) * 10);
      return rounded >= ML_PER_LITRE
        ? { unit: 'l', value: Math.round((rounded / ML_PER_LITRE) * 10) / 10 }
        : { unit, value: rounded };
    }
    case 'piece':
    case 'can':
    case 'bunch':
      /* The epsilon keeps 1.0000000000000002 — which floating-point addition of
         three 0.3-portions really does produce — from asking for two tins. */
      return { unit, value: Math.max(1, Math.ceil(amount - 1e-9)) };
  }
}

/* ---------------------------------------------------------------- portions */

export interface Portion {
  readonly ingredient: Ingredient;
  /** Already scaled and rounded for cooking. */
  readonly quantity: Quantity;
}

/** A recipe's ingredients, scaled to the number of people it is being cooked for. */
export function portionsFor(recipe: Recipe, persons: number): readonly Portion[] {
  const people = clampPersons(persons);
  return recipe.ingredients.map((line) => {
    const ingredient = ingredientById(line.id);
    return {
      ingredient,
      quantity: cookingQuantity(ingredient.unit, line.perPerson * people),
    };
  });
}

/* ----------------------------------------------------------- shopping list */

/**
 * Something the user put on the list themselves.
 *
 * Unlike a recipe ingredient this carries no unit and is never scaled: "2 packs
 * of coffee" is a note, not an amount the tool can do arithmetic on. It belongs
 * to one of the existing aisles so it appears where it will be picked up rather
 * than in a separate list at the bottom.
 */
export interface CustomItem {
  readonly id: string;
  readonly name: string;
  /** Free-text amount, e.g. "2 packs". May be empty. */
  readonly note: string;
  readonly category: Category;
}

/** A line on the shopping list: either an ingredient the recipes need, or an own item. */
export type ShoppingEntry =
  | {
      readonly kind: 'ingredient';
      readonly ingredient: Ingredient;
      /** Scaled, summed across recipes, then rounded to what a shop sells. */
      readonly quantity: Quantity;
      /** Identifier for the tick, stable across reloads and locale changes. */
      readonly checkId: string;
    }
  | { readonly kind: 'custom'; readonly item: CustomItem; readonly checkId: string };

export interface ShoppingGroup {
  readonly category: Category;
  readonly entries: readonly ShoppingEntry[];
}

/** The tick id for an ingredient. Namespaced so it cannot collide with a staple. */
export function ingredientCheckId(id: string): string {
  return `ing:${id}`;
}

/** The tick id for a cupboard staple. */
export function stapleCheckId(id: string): string {
  return `staple:${id}`;
}

/** The tick id for an own item. */
export function customCheckId(id: string): string {
  return `custom:${id}`;
}

/**
 * Add the selected recipes up into one list, grouped by aisle, with the user's
 * own items folded into the aisle each was filed under.
 *
 * Amounts are summed *before* rounding: three portions of 0.5 an onion is two
 * onions, not three. Rounding each recipe separately and adding afterwards was
 * what made the old list over-buy on every shared ingredient.
 */
export function shoppingList(
  recipes: readonly Recipe[],
  persons: number,
  custom: readonly CustomItem[] = [],
): readonly ShoppingGroup[] {
  const people = clampPersons(persons);
  const totals = new Map<string, number>();

  for (const recipe of recipes) {
    for (const line of recipe.ingredients) {
      totals.set(line.id, (totals.get(line.id) ?? 0) + line.perPerson * people);
    }
  }

  const groups: ShoppingGroup[] = [];
  for (const category of CATEGORY_ORDER) {
    const fromRecipes: ShoppingEntry[] = INGREDIENTS.filter(
      (ingredient) => ingredient.category === category && (totals.get(ingredient.id) ?? 0) > 0,
    ).map((ingredient) => ({
      kind: 'ingredient',
      ingredient,
      quantity: purchaseQuantity(ingredient.unit, totals.get(ingredient.id) ?? 0),
      checkId: ingredientCheckId(ingredient.id),
    }));

    /* Own items come after the ingredients of the same aisle: the recipe-driven
       part of the list is the part that changes when the person count does, and
       keeping it contiguous makes that easier to follow. */
    const own: ShoppingEntry[] = custom
      .filter((item) => item.category === category)
      .map((item) => ({ kind: 'custom', item, checkId: customCheckId(item.id) }));

    const entries = [...fromRecipes, ...own];
    if (entries.length > 0) groups.push({ category, entries });
  }
  return groups;
}

/** Total number of entries across the groups, for the progress readout. */
export function countEntries(groups: readonly ShoppingGroup[]): number {
  return groups.reduce((total, group) => total + group.entries.length, 0);
}

/* ------------------------------------------------------------- own items */

export interface CustomDraft {
  readonly name: string;
  readonly note: string;
  readonly category: Category;
}

/**
 * Append an own item, trimming and bounding what the form supplied.
 *
 * Bounding happens here rather than only on the input element: a `maxlength`
 * attribute is a hint to the browser, and the decoder on the way back out of
 * storage would reject — and so silently drop — anything longer.
 */
export function addCustomItem(
  items: readonly CustomItem[],
  draft: CustomDraft,
): readonly CustomItem[] {
  const name = draft.name.trim().slice(0, MAX_CUSTOM_NAME);
  if (name === '' || items.length >= MAX_CUSTOM_ITEMS) return items;

  return [
    ...items,
    {
      id: nextCustomId(items),
      name,
      note: draft.note.trim().slice(0, MAX_CUSTOM_NOTE),
      category: draft.category,
    },
  ];
}

export function removeCustomItem(items: readonly CustomItem[], id: string): readonly CustomItem[] {
  return items.filter((item) => item.id !== id);
}

/**
 * One past the highest id in use.
 *
 * Derived from the list rather than from the clock, so the function stays pure
 * and two items added in the same millisecond cannot collide — which would make
 * one item's tick silently toggle the other's.
 */
function nextCustomId(items: readonly CustomItem[]): string {
  const highest = items.reduce((max, item) => {
    const parsed = Number.parseInt(item.id, 10);
    return Number.isSafeInteger(parsed) && parsed > max ? parsed : max;
  }, 0);
  return String(highest + 1);
}

/* ---------------------------------------------------------------- ticks */

/**
 * Which half of the list a "clear the ticks" action applies to.
 *
 * The two are cleared separately because they are restocked on different
 * rhythms: the ingredients change with every set of recipes, while the cupboard
 * staples are checked every few weeks. One button for both meant that clearing
 * a finished shopping trip also wiped the record of which staples were still in.
 */
export type TickScope = 'ingredients' | 'staples';

const STAPLE_PREFIX = 'staple:';

/** The ticks that survive clearing `scope`. Own items clear with the ingredients. */
export function clearTicks(checked: Iterable<string>, scope: TickScope): string[] {
  return [...checked].filter((id) =>
    scope === 'staples' ? !id.startsWith(STAPLE_PREFIX) : id.startsWith(STAPLE_PREFIX),
  );
}

/* ----------------------------------------------- method / ingredient check */

interface Mention {
  readonly id: string;
  readonly pattern: RegExp;
}

/*
 * A mention is matched at a letter boundary on the left but may run on to the
 * right, which is what makes one stem cover German inflection (`Zitrone` also
 * matches `Zitronensaft`) and English plurals (`tomato` also matches
 * `tomatoes`). Anchoring only on the left is deliberate: a right-hand boundary
 * would need every inflected form spelled out, and `\b` cannot be used at all
 * here because JavaScript defines it in terms of `[A-Za-z0-9_]` — `\böl\b`
 * happily matches inside `Olivenöl`.
 */
const LETTER = '[\\p{L}\\p{N}]';

function mentionPattern(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<!${LETTER})${escaped}`, 'giu');
}

/**
 * The mention patterns, built on first use rather than at module load.
 *
 * `unlistedMentions` is a check over the catalogue that runs in the test suite;
 * nothing in the running application calls it. Building these eagerly made every
 * visit to the Recipes page compile 139 regular expressions and immediately
 * throw them away — and the bundler could not remove that work, because
 * `new RegExp` is not provably free of side effects, so tree-shaking the binding
 * left the calls that fed it behind as bare expression statements.
 */
const mentionsByLocale = new Map<Locale, readonly Mention[]>();

function mentionsFor(locale: Locale): readonly Mention[] {
  const existing = mentionsByLocale.get(locale);
  if (existing !== undefined) return existing;
  const built = buildMentions(locale);
  mentionsByLocale.set(locale, built);
  return built;
}

function buildMentions(locale: Locale): readonly Mention[] {
  const mentions: Mention[] = [];
  for (const ingredient of INGREDIENTS) {
    for (const keyword of ingredient.mentions[locale]) {
      mentions.push({ id: ingredient.id, pattern: mentionPattern(keyword) });
    }
  }
  for (const staple of STAPLES) {
    for (const keyword of staple.mentions[locale]) {
      mentions.push({ id: stapleCheckId(staple.id), pattern: mentionPattern(keyword) });
    }
  }
  return mentions;
}

/** Every cupboard staple, as tick ids, so a method may name them freely. */
let stapleIds: ReadonlySet<string> | undefined;

/** Built on first use, for the same reason as `mentionsFor`. */
function stapleIdSet(): ReadonlySet<string> {
  stapleIds ??= new Set(STAPLES.map((staple) => stapleCheckId(staple.id)));
  return stapleIds;
}

/**
 * Ingredients a recipe's method calls for but its ingredient list does not.
 *
 * This exists because several of the imported recipes did exactly that: the
 * avocado toast squeezed a lemon it never bought, the bean salad was tossed with
 * salad leaves that appeared nowhere, and three recipes reached for soy sauce,
 * curry powder and dried herbs that were not even cupboard staples. Nothing in a
 * page of prose flags that, so the check is mechanical and runs in the test
 * suite over every recipe in both languages — including the ones a future
 * assistant adds to `data.ts`.
 *
 * Where two keywords overlap, the longer one wins: `passierte Tomaten` is a tin
 * of sieved tomatoes, not a tin plus a fresh tomato.
 */
export function unlistedMentions(recipe: Recipe, locale: Locale): readonly string[] {
  const listed = new Set(recipe.ingredients.map((line) => line.id));
  const missing = new Set<string>();
  const staples = stapleIdSet();

  for (const step of recipe.steps[locale]) {
    for (const { id } of longestMatches(step, mentionsFor(locale))) {
      if (!listed.has(id) && !staples.has(id)) missing.add(id);
    }
  }
  return [...missing];
}

interface Match {
  readonly id: string;
  readonly start: number;
  readonly end: number;
}

function longestMatches(text: string, mentions: readonly Mention[]): readonly Match[] {
  const found: Match[] = [];
  for (const { id, pattern } of mentions) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      found.push({ id, start: match.index, end: match.index + match[0].length });
      /* A zero-length match cannot happen — every keyword has at least one
         character — so `exec` is guaranteed to advance. */
    }
  }
  return found.filter(
    (candidate) =>
      !found.some(
        (other) =>
          other !== candidate &&
          other.start <= candidate.start &&
          other.end >= candidate.end &&
          other.end - other.start > candidate.end - candidate.start,
      ),
  );
}

/* -------------------------------------------------------------- persistence */

export interface RecipeState {
  readonly persons: number;
  /** Ids of the recipes on the list. */
  readonly selected: readonly string[];
  /** Tick ids, from `ingredientCheckId`, `stapleCheckId` and `customCheckId`. */
  readonly checked: readonly string[];
  /** Items the user added themselves. */
  readonly custom: readonly CustomItem[];
}

/** Ids are dropped rather than rejected: one stale id must not cost the whole list. */
function idList(limit: number): Decoder<string[]> {
  return (input, path) => {
    const decoded = lenientArrayOf(maxLength(string, MAX_ID_LENGTH))(input, path);
    return decoded.ok ? { ok: true, value: decoded.value.slice(0, limit) } : decoded;
  };
}

const customItemDecoder: Decoder<CustomItem> = objectOf({
  id: maxLength(string, MAX_ID_LENGTH),
  name: maxLength(string, MAX_CUSTOM_NAME),
  note: withDefault(maxLength(string, MAX_CUSTOM_NOTE), ''),
  /* An aisle that no longer exists would leave the item unreachable, so the
     value is checked against the catalogue rather than trusted. */
  category: literals(...CATEGORY_ORDER),
});

const customList: Decoder<CustomItem[]> = (input, path) => {
  const decoded = lenientArrayOf(customItemDecoder)(input, path);
  return decoded.ok ? { ok: true, value: decoded.value.slice(0, MAX_CUSTOM_ITEMS) } : decoded;
};

const stateDecoder: Decoder<RecipeState> = objectOf({
  persons: withDefault(inRange(integer, MIN_PERSONS, MAX_PERSONS), MIN_PERSONS),
  /* Selections are filtered against the catalogue on read, so a recipe removed
     from `data.ts` cannot linger invisibly in someone's shopping list. */
  selected: withDefault(idList(RECIPES.length), []),
  checked: withDefault(idList(MAX_CHECKED), []),
  custom: withDefault(customList, []),
});

export function createRecipeStore(): Store<RecipeState> {
  return defineStore<RecipeState>({
    key: 'recipes.state',
    decoder: (input, path) => {
      const decoded = stateDecoder(input, path);
      if (!decoded.ok) return decoded;
      return {
        ok: true,
        value: {
          ...decoded.value,
          selected: decoded.value.selected.filter((id) => RECIPES_BY_ID.has(id)),
        },
      };
    },
    fallback: () => ({ persons: MIN_PERSONS, selected: [], checked: [], custom: [] }),
  });
}

/** Keep a person count inside the range the stepper offers. */
export function clampPersons(persons: number): number {
  if (!Number.isFinite(persons)) return MIN_PERSONS;
  return Math.min(Math.max(Math.round(persons), MIN_PERSONS), MAX_PERSONS);
}
