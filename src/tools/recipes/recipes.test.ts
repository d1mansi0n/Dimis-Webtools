import { describe, expect, it } from 'vitest';
import { LOCALES } from '../../i18n/index.js';
import { INGREDIENTS, RECIPES, STAPLES, type Recipe } from './data.js';
import {
  clampPersons,
  cookingQuantity,
  addCustomItem,
  clearTicks,
  countEntries,
  createRecipeStore,
  customCheckId,
  ingredientById,
  ingredientCheckId,
  MAX_CUSTOM_ITEMS,
  MAX_CUSTOM_NAME,
  MAX_PERSONS,
  portionsFor,
  purchaseQuantity,
  recipesOf,
  removeCustomItem,
  stapleCheckId,
  selectedRecipes,
  shoppingList,
  unlistedMentions,
} from './recipes.js';

/** The ingredient entries of a list, with the union already narrowed. */
const ingredientEntries = (groups: ReturnType<typeof shoppingList>) =>
  groups.flatMap((group) => group.entries).filter((entry) => entry.kind === 'ingredient');

const recipe = (id: string): Recipe => {
  const found = RECIPES.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`test fixture: no recipe "${id}"`);
  return found;
};

describe('the catalogue', () => {
  it('gives every recipe a unique id', () => {
    expect(new Set(RECIPES.map((entry) => entry.id)).size).toBe(RECIPES.length);
  });

  it('gives every ingredient a unique id', () => {
    expect(new Set(INGREDIENTS.map((entry) => entry.id)).size).toBe(INGREDIENTS.length);
  });

  it('names only ingredients that exist', () => {
    for (const entry of RECIPES) {
      for (const line of entry.ingredients) {
        expect(() => ingredientById(line.id), `${entry.id} → ${line.id}`).not.toThrow();
      }
    }
  });

  it('gives every recipe a positive amount of every ingredient it lists', () => {
    for (const entry of RECIPES) {
      expect(entry.ingredients.length, entry.id).toBeGreaterThan(0);
      for (const line of entry.ingredients) {
        expect(line.perPerson, `${entry.id} → ${line.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('writes the same number of method steps in every language', () => {
    for (const entry of RECIPES) {
      expect(entry.steps.en.length, entry.id).toBe(entry.steps.de.length);
      for (const step of [...entry.steps.de, ...entry.steps.en]) {
        expect(step.trim(), entry.id).not.toBe('');
      }
    }
  });

  it('claims each mention keyword for exactly one ingredient or staple', () => {
    /* Two ingredients answering to the same word would make the check below
       depend on catalogue order, which is not a property to leave to chance. */
    for (const locale of LOCALES) {
      const keywords = [...INGREDIENTS, ...STAPLES].flatMap((entry) =>
        entry.mentions[locale].map((word) => word.toLowerCase()),
      );
      expect(new Set(keywords).size, locale).toBe(keywords.length);
    }
  });
});

describe('checking a method against its ingredient list', () => {
  /*
   * The regression test for the imported collection: the avocado toast squeezed
   * a lemon and the bean salad was tossed with salad leaves, but neither
   * ingredient was on the list, so neither was ever bought. Three other recipes
   * called for soy sauce, curry powder and dried herbs that were not even
   * cupboard staples.
   */
  it('finds nothing unbought in any recipe, in either language', () => {
    for (const locale of LOCALES) {
      for (const entry of RECIPES) {
        expect(unlistedMentions(entry, locale), `${entry.id} (${locale})`).toEqual([]);
      }
    }
  });

  it('reports an ingredient a step calls for but the list omits', () => {
    const withoutLemon: Recipe = {
      ...recipe('bread-avocado-hummus'),
      ingredients: recipe('bread-avocado-hummus').ingredients.filter((line) => line.id !== 'lemon'),
    };

    expect(unlistedMentions(withoutLemon, 'de')).toEqual(['lemon']);
    expect(unlistedMentions(withoutLemon, 'en')).toEqual(['lemon']);
  });

  it('lets a method name a cupboard staple without listing it', () => {
    /* Salt, oil and turmeric are assumed to be in the cupboard; demanding they
       be listed per recipe would make every ingredient list unreadable. */
    expect(unlistedMentions(recipe('tofu-scramble-spinach'), 'de')).toEqual([]);
  });

  it('reads "passierte Tomaten" as the tin, not as a fresh tomato as well', () => {
    /* The longest overlapping keyword wins; without that rule the bolognese
       would demand a fresh tomato it never uses. */
    expect(unlistedMentions(recipe('pasta-lentil-bolognese'), 'de')).toEqual([]);
    expect(unlistedMentions(recipe('pasta-lentil-bolognese'), 'en')).toEqual([]);
  });

  it('does not read "Olivenöl" as a mention of the oil-free word inside it', () => {
    /* `\b` would have matched `öl` inside `Olivenöl`, because JavaScript defines
       word characters as ASCII. The letter-boundary lookbehind does not. */
    const soup: Recipe = {
      ...recipe('squash-carrot-soup'),
      steps: { de: ['Kürbis mit Olivenöl einreiben.'], en: ['Rub the squash with olive oil.'] },
    };
    expect(unlistedMentions(soup, 'de')).toEqual([]);
  });
});

describe('cooking amounts', () => {
  it('scales a weight with the number of people', () => {
    const porridge = portionsFor(recipe('porridge-berries'), 3);
    const oats = porridge.find((portion) => portion.ingredient.id === 'oats');

    expect(oats?.quantity).toEqual({ unit: 'g', value: 180 });
  });

  it('keeps a fraction of a countable ingredient instead of rounding it up', () => {
    /* Half an avocado is what the recipe wants; the shopping list is where a
       whole avocado belongs. The old tool showed "1 Stück" here. */
    const [, avocado] = portionsFor(recipe('bread-avocado-hummus'), 1);

    expect(avocado?.ingredient.id).toBe('avocado');
    expect(avocado?.quantity).toEqual({ unit: 'piece', value: 0.5 });
  });

  it('rounds a scaled fraction to a quarter rather than to floating-point noise', () => {
    const [, , , , lemon] = portionsFor(recipe('bread-avocado-hummus'), 3);

    expect(lemon?.ingredient.id).toBe('lemon');
    expect(lemon?.quantity).toEqual({ unit: 'piece', value: 0.75 });
  });

  it('switches millilitres to litres once there are more than a thousand', () => {
    expect(cookingQuantity('ml', 280)).toEqual({ unit: 'ml', value: 280 });
    expect(cookingQuantity('ml', 1120)).toEqual({ unit: 'l', value: 1.1 });
  });

  it('never scales below one person or above the stepper maximum', () => {
    const forZero = portionsFor(recipe('porridge-berries'), 0);
    const forTen = portionsFor(recipe('porridge-berries'), 10);

    expect(forZero[0]?.quantity.value).toBe(60);
    expect(forTen[0]?.quantity.value).toBe(60 * MAX_PERSONS);
  });
});

describe('shopping amounts', () => {
  it('rounds a weight to something you can weigh out', () => {
    expect(purchaseQuantity('g', 187)).toEqual({ unit: 'g', value: 190 });
    expect(purchaseQuantity('g', 3)).toEqual({ unit: 'g', value: 10 });
  });

  it('rounds a countable ingredient up, because half a tin cannot be bought', () => {
    expect(purchaseQuantity('can', 0.7)).toEqual({ unit: 'can', value: 1 });
    expect(purchaseQuantity('can', 1.4)).toEqual({ unit: 'can', value: 2 });
  });

  it('does not ask for a second tin because of floating-point addition', () => {
    /* 0.3 + 0.3 + 0.3 + 0.1 is 1.0000000000000002 in binary floating point, and
       a bare `Math.ceil` turns that into two tins. */
    expect(purchaseQuantity('can', 0.3 + 0.3 + 0.3 + 0.1)).toEqual({ unit: 'can', value: 1 });
  });

  it('reports litres for large volumes', () => {
    expect(purchaseQuantity('ml', 1680)).toEqual({ unit: 'l', value: 1.7 });
  });
});

describe('the shopping list', () => {
  it('is empty when nothing is selected', () => {
    expect(shoppingList([], 2)).toEqual([]);
  });

  it('adds an ingredient up across recipes before rounding it', () => {
    /* Two recipes needing half an onion each is one onion. Rounding each recipe
       first and adding afterwards — what the old tool did — bought two. */
    const list = shoppingList(
      [recipe('lentil-vegetable-stew'), recipe('pasta-lentil-bolognese')],
      1,
    );
    const onions = ingredientEntries(list).find((entry) => entry.ingredient.id === 'onions');

    expect(onions?.quantity).toEqual({ unit: 'piece', value: 1 });
  });

  it('scales with the number of people', () => {
    const forOne = shoppingList([recipe('porridge-berries')], 1);
    const forFour = shoppingList([recipe('porridge-berries')], 4);

    const oats = (groups: ReturnType<typeof shoppingList>): number | undefined =>
      ingredientEntries(groups).find((entry) => entry.ingredient.id === 'oats')?.quantity.value;

    expect(oats(forOne)).toBe(60);
    expect(oats(forFour)).toBe(240);
  });

  it('groups the lines by aisle, in the order the aisles come in', () => {
    const list = shoppingList([recipe('quinoa-salad-feta')], 1);

    expect(list.map((group) => group.category)).toEqual([
      'fruit',
      'vegetables',
      'chilled',
      'grains',
    ]);
  });

  it('gives every line a tick id that survives a locale change', () => {
    const list = shoppingList([recipe('trail-mix')], 1);

    expect(list[0]?.entries[0]?.checkId).toBe(ingredientCheckId('trail-mix'));
  });

  it('counts its lines for the progress readout', () => {
    expect(countEntries(shoppingList([recipe('nuts-apple')], 1))).toBe(2);
  });
});

describe('own items', () => {
  const coffee = { name: 'Coffee', note: '2 packs', category: 'cupboard' } as const;

  it('adds an item and files it under the chosen aisle', () => {
    const items = addCustomItem([], coffee);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Coffee', note: '2 packs', category: 'cupboard' });
  });

  it('gives every item an id no other item is using', () => {
    /* Ids come from the list rather than the clock: two items added in the same
       millisecond would otherwise share an id, and ticking one would tick both. */
    const items = [coffee, coffee, coffee].reduce<ReturnType<typeof addCustomItem>>(
      addCustomItem,
      [],
    );

    expect(new Set(items.map((item) => item.id)).size).toBe(3);
  });

  it('does not reuse the id of a removed item', () => {
    const two = addCustomItem(addCustomItem([], coffee), { ...coffee, name: 'Tea' });
    const afterRemoval = removeCustomItem(two, two[1]!.id);
    const readded = addCustomItem(afterRemoval, { ...coffee, name: 'Salt' });

    expect(new Set(readded.map((item) => item.id)).size).toBe(readded.length);
  });

  it('ignores an empty name', () => {
    expect(addCustomItem([], { ...coffee, name: '   ' })).toEqual([]);
  });

  it('trims and bounds what the form supplied', () => {
    const items = addCustomItem([], { ...coffee, name: `  ${'x'.repeat(200)}  ` });

    expect(items[0]?.name).toHaveLength(MAX_CUSTOM_NAME);
  });

  it('stops at the maximum rather than growing without bound', () => {
    let items = addCustomItem([], coffee);
    for (let index = 0; index < MAX_CUSTOM_ITEMS + 10; index++) {
      items = addCustomItem(items, coffee);
    }

    expect(items).toHaveLength(MAX_CUSTOM_ITEMS);
  });

  it('puts an item on the shopping list, in its own aisle, after the ingredients', () => {
    const items = addCustomItem([], { name: 'Coffee', note: '', category: 'fruit' });
    const list = shoppingList([recipe('nuts-apple')], 1, items);
    const fruit = list.find((group) => group.category === 'fruit');

    expect(fruit?.entries.map((entry) => entry.kind)).toEqual(['ingredient', 'custom']);
  });

  it('shows an aisle that holds nothing but own items', () => {
    /* Nothing is cooked here, so without the item the list would be empty. */
    const items = addCustomItem([], coffee);

    expect(shoppingList([], 1, items).map((group) => group.category)).toEqual(['cupboard']);
  });

  it('never scales an own item with the number of people', () => {
    const items = addCustomItem([], coffee);
    const one = shoppingList([], 1, items);
    const six = shoppingList([], 6, items);

    expect(one).toEqual(six);
  });

  it('removes an item by id', () => {
    const items = addCustomItem([], coffee);

    expect(removeCustomItem(items, items[0]!.id)).toEqual([]);
  });
});

describe('clearing ticks', () => {
  /*
   * The two halves of the list are restocked on different rhythms — the
   * ingredients change with every set of recipes, the cupboard staples are
   * checked every few weeks — so one button for both wiped the staples along
   * with a finished shopping trip.
   */
  const ticks = [
    ingredientCheckId('oats'),
    customCheckId('1'),
    stapleCheckId('oil'),
    stapleCheckId('salt'),
  ];

  it('clears the ingredients and own items, keeping the staples', () => {
    expect(clearTicks(ticks, 'ingredients')).toEqual([stapleCheckId('oil'), stapleCheckId('salt')]);
  });

  it('clears the staples, keeping the ingredients and own items', () => {
    expect(clearTicks(ticks, 'staples')).toEqual([ingredientCheckId('oats'), customCheckId('1')]);
  });

  it('leaves nothing behind when both halves are cleared in turn', () => {
    expect(clearTicks(clearTicks(ticks, 'ingredients'), 'staples')).toEqual([]);
  });
});

describe('selecting recipes', () => {
  it('returns them in catalogue order, whatever order they were chosen in', () => {
    const chosen = selectedRecipes(['trail-mix', 'porridge-berries']);

    expect(chosen.map((entry) => entry.id)).toEqual(['porridge-berries', 'trail-mix']);
  });

  it('ignores an id that is not in the catalogue', () => {
    expect(selectedRecipes(['nope'])).toEqual([]);
  });

  it('lists the recipes for a meal', () => {
    expect(recipesOf('snack').every((entry) => entry.meal === 'snack')).toBe(true);
    expect(recipesOf('snack').length).toBeGreaterThan(0);
  });
});

describe('the stored state', () => {
  it('starts from a usable default when nothing has been saved', () => {
    const store = createRecipeStore();
    store.clear();

    expect(store.read()).toEqual({ persons: 1, selected: [], checked: [], custom: [] });
  });

  it('round-trips a selection', () => {
    const store = createRecipeStore();
    store.write({
      persons: 3,
      selected: ['trail-mix'],
      checked: [ingredientCheckId('oats')],
      custom: [{ id: '1', name: 'Coffee', note: '2 packs', category: 'cupboard' }],
    });

    expect(store.read()).toEqual({
      persons: 3,
      selected: ['trail-mix'],
      checked: [ingredientCheckId('oats')],
      custom: [{ id: '1', name: 'Coffee', note: '2 packs', category: 'cupboard' }],
    });
  });

  it('drops a selected recipe that no longer exists', () => {
    /* Recipes are curated in `data.ts`, so one can be renamed or removed between
       visits. A stale id would otherwise sit in the state for ever, invisible
       and uncheckable. */
    const store = createRecipeStore();
    localStorage.setItem(
      store.key,
      JSON.stringify({ persons: 2, selected: ['trail-mix', 'deleted-recipe'], checked: [] }),
    );

    expect(store.read().selected).toEqual(['trail-mix']);
  });

  it('falls back to one person when the stored count is out of range', () => {
    const store = createRecipeStore();
    localStorage.setItem(store.key, JSON.stringify({ persons: 99, selected: [], checked: [] }));

    expect(store.read().persons).toBe(1);
  });

  it('survives a value that is not the right shape at all', () => {
    const store = createRecipeStore();
    localStorage.setItem(store.key, '"not an object"');

    expect(store.read()).toEqual({ persons: 1, selected: [], checked: [], custom: [] });
  });

  it('drops an own item filed under an aisle that does not exist', () => {
    const store = createRecipeStore();
    localStorage.setItem(
      store.key,
      JSON.stringify({
        persons: 1,
        selected: [],
        checked: [],
        custom: [
          { id: '1', name: 'Coffee', note: '', category: 'cupboard' },
          { id: '2', name: 'Ghost', note: '', category: 'no-such-aisle' },
        ],
      }),
    );

    expect(store.read().custom.map((item) => item.id)).toEqual(['1']);
  });
});

describe('clampPersons', () => {
  it('keeps the count inside the range the stepper offers', () => {
    expect(clampPersons(0)).toBe(1);
    expect(clampPersons(3)).toBe(3);
    expect(clampPersons(99)).toBe(MAX_PERSONS);
    expect(clampPersons(Number.NaN)).toBe(1);
  });
});
