import type { Locale } from '../../i18n/index.js';

/**
 * The recipe catalogue.
 *
 * This is data, not UI chrome, so — as in the Sugar Calculator's food table —
 * each row carries its own label per language. Keeping the pair together makes
 * it impossible to add a recipe in one language only.
 *
 * The collection grows by editing this file. There is deliberately no way to add
 * a recipe from the page: recipes are curated here, with their ingredients
 * expressed in catalogue units so that a shopping list can be added up across
 * recipes and scaled by the number of people. Free text typed into a form could
 * do neither, which is why the previous standalone version's "own recipes" ended
 * up in a separate, unscalable section of the list.
 */

/** How an ingredient is measured. Amounts are always per person. */
export type Unit = 'g' | 'ml' | 'piece' | 'can' | 'bunch';

/** Aisle grouping for the shopping list. */
export type Category = 'fruit' | 'vegetables' | 'chilled' | 'grains' | 'nuts' | 'cupboard';

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type Localised = Readonly<Record<Locale, string>>;
export type LocalisedList = Readonly<Record<Locale, readonly string[]>>;

export interface Ingredient {
  readonly id: string;
  readonly name: Localised;
  readonly unit: Unit;
  readonly category: Category;
  /** Perishable, so it wants buying close to the day it is eaten. */
  readonly fresh: boolean;
  /**
   * The words that name this ingredient inside a method step.
   *
   * These exist so `unlistedMentions()` can prove that every ingredient a recipe
   * *cooks with* is also an ingredient it *shops for* — see the comment there.
   * Give the stem: matching tolerates a suffix, so `Zitrone` also covers
   * `Zitronensaft` and `tomato` also covers `tomatoes`.
   */
  readonly mentions: LocalisedList;
}

export interface RecipeIngredient {
  readonly id: string;
  /** Amount for one person, in the ingredient's unit. */
  readonly perPerson: number;
}

export interface Recipe {
  readonly id: string;
  readonly meal: Meal;
  readonly name: Localised;
  readonly ingredients: readonly RecipeIngredient[];
  readonly steps: Readonly<Record<Locale, readonly string[]>>;
}

/**
 * Things assumed to be in the cupboard already.
 *
 * They are on the list because running out of stock or soy sauce still ruins a
 * recipe, but they are not scaled by the number of people — a bottle of oil is a
 * bottle of oil.
 */
export interface Staple {
  readonly id: string;
  readonly name: Localised;
  readonly note: Localised;
  readonly mentions: LocalisedList;
}

export const MEAL_ORDER: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Roughly the order these aisles come in, so the list can be walked top to bottom. */
export const CATEGORY_ORDER: readonly Category[] = [
  'fruit',
  'vegetables',
  'chilled',
  'grains',
  'nuts',
  'cupboard',
];

export const INGREDIENTS: readonly Ingredient[] = [
  /* ---------------------------------------------------------------- fruit */
  {
    id: 'berries',
    name: { de: 'Beeren (frisch oder TK)', en: 'Berries (fresh or frozen)' },
    unit: 'g',
    category: 'fruit',
    fresh: true,
    mentions: { de: ['Beere'], en: ['berry', 'berries'] },
  },
  {
    id: 'apples',
    name: { de: 'Äpfel', en: 'Apples' },
    unit: 'piece',
    category: 'fruit',
    fresh: true,
    mentions: { de: ['Apfel', 'Äpfel'], en: ['apple'] },
  },
  {
    id: 'bananas',
    name: { de: 'Bananen', en: 'Bananas' },
    unit: 'piece',
    category: 'fruit',
    fresh: true,
    mentions: { de: ['Banane'], en: ['banana'] },
  },
  {
    id: 'oranges',
    name: { de: 'Orangen', en: 'Oranges' },
    unit: 'piece',
    category: 'fruit',
    fresh: true,
    mentions: { de: ['Orange'], en: ['orange'] },
  },
  {
    id: 'lemon',
    name: { de: 'Zitrone', en: 'Lemon' },
    unit: 'piece',
    category: 'fruit',
    fresh: true,
    mentions: { de: ['Zitrone'], en: ['lemon'] },
  },
  {
    id: 'avocado',
    name: { de: 'Avocado', en: 'Avocado' },
    unit: 'piece',
    category: 'fruit',
    fresh: true,
    mentions: { de: ['Avocado'], en: ['avocado'] },
  },
  {
    id: 'cherry-tomatoes',
    name: { de: 'Cherrytomaten', en: 'Cherry tomatoes' },
    unit: 'g',
    category: 'fruit',
    fresh: true,
    mentions: { de: ['Cherrytomate'], en: ['cherry tomato'] },
  },
  {
    id: 'tomatoes',
    name: { de: 'Tomaten', en: 'Tomatoes' },
    unit: 'piece',
    category: 'fruit',
    fresh: true,
    mentions: { de: ['Tomate'], en: ['tomato'] },
  },

  /* ----------------------------------------------------------- vegetables */
  {
    id: 'spinach',
    name: { de: 'Blattspinat (frisch)', en: 'Spinach (fresh)' },
    unit: 'g',
    category: 'vegetables',
    fresh: true,
    mentions: { de: ['Spinat'], en: ['spinach'] },
  },
  {
    id: 'broccoli',
    name: { de: 'Brokkoli', en: 'Broccoli' },
    unit: 'g',
    category: 'vegetables',
    fresh: true,
    mentions: { de: ['Brokkoli'], en: ['broccoli'] },
  },
  {
    id: 'bell-pepper',
    name: { de: 'Paprika', en: 'Bell peppers' },
    unit: 'piece',
    category: 'vegetables',
    fresh: true,
    /* English deliberately says "bell pepper" throughout: a bare "pepper" would
       also match the black pepper in "salt and pepper". */
    mentions: { de: ['Paprika'], en: ['bell pepper'] },
  },
  {
    id: 'cucumber',
    name: { de: 'Gurke', en: 'Cucumber' },
    unit: 'piece',
    category: 'vegetables',
    fresh: true,
    mentions: { de: ['Gurke'], en: ['cucumber'] },
  },
  {
    id: 'radishes',
    name: { de: 'Radieschen', en: 'Radishes' },
    unit: 'bunch',
    category: 'vegetables',
    fresh: true,
    mentions: { de: ['Radieschen'], en: ['radish'] },
  },
  {
    id: 'salad-leaves',
    name: { de: 'Blattsalat', en: 'Salad leaves' },
    unit: 'g',
    category: 'vegetables',
    fresh: true,
    mentions: { de: ['Blattsalat', 'Salat'], en: ['salad leaves', 'salad'] },
  },
  {
    id: 'sweet-potato',
    name: { de: 'Süßkartoffel', en: 'Sweet potato' },
    unit: 'g',
    category: 'vegetables',
    fresh: false,
    mentions: { de: ['Süßkartoffel'], en: ['sweet potato'] },
  },
  {
    id: 'carrots',
    name: { de: 'Karotten', en: 'Carrots' },
    unit: 'g',
    category: 'vegetables',
    fresh: false,
    mentions: { de: ['Karotte', 'Möhre'], en: ['carrot'] },
  },
  {
    id: 'onions',
    name: { de: 'Zwiebeln', en: 'Onions' },
    unit: 'piece',
    category: 'vegetables',
    fresh: false,
    mentions: { de: ['Zwiebel'], en: ['onion'] },
  },
  {
    id: 'ginger',
    name: { de: 'Ingwer', en: 'Ginger' },
    unit: 'g',
    category: 'vegetables',
    fresh: false,
    mentions: { de: ['Ingwer'], en: ['ginger'] },
  },
  {
    id: 'potatoes',
    name: { de: 'Kartoffeln', en: 'Potatoes' },
    unit: 'g',
    category: 'vegetables',
    fresh: false,
    mentions: { de: ['Kartoffel'], en: ['potato'] },
  },
  {
    id: 'squash',
    name: { de: 'Kürbis (z. B. Hokkaido)', en: 'Squash (e.g. Hokkaido)' },
    unit: 'g',
    category: 'vegetables',
    fresh: false,
    mentions: { de: ['Kürbis'], en: ['squash'] },
  },

  /* -------------------------------------------------------------- chilled */
  {
    id: 'plant-milk',
    name: { de: 'Pflanzenmilch (mit Calcium + B12)', en: 'Plant milk (with calcium + B12)' },
    unit: 'ml',
    category: 'chilled',
    fresh: false,
    mentions: { de: ['Pflanzenmilch'], en: ['plant milk'] },
  },
  {
    id: 'plant-yoghurt',
    name: { de: 'Pflanzenjoghurt', en: 'Plant yoghurt' },
    unit: 'g',
    category: 'chilled',
    fresh: true,
    mentions: { de: ['Pflanzenjoghurt', 'Joghurt'], en: ['plant yoghurt', 'yoghurt'] },
  },
  {
    id: 'silken-tofu',
    name: { de: 'Seidentofu', en: 'Silken tofu' },
    unit: 'g',
    category: 'chilled',
    fresh: false,
    mentions: { de: ['Seidentofu'], en: ['silken tofu'] },
  },
  {
    id: 'firm-tofu',
    name: { de: 'Fester Tofu', en: 'Firm tofu' },
    unit: 'g',
    category: 'chilled',
    fresh: false,
    mentions: { de: ['Tofu'], en: ['tofu'] },
  },
  {
    id: 'feta',
    name: { de: 'Veganer Feta', en: 'Vegan feta' },
    unit: 'g',
    category: 'chilled',
    fresh: true,
    mentions: { de: ['Feta'], en: ['feta'] },
  },
  {
    id: 'cheese',
    name: { de: 'Veganer Käse', en: 'Vegan cheese' },
    unit: 'g',
    category: 'chilled',
    fresh: false,
    mentions: { de: ['Käse'], en: ['cheese'] },
  },

  /* --------------------------------------------------- pulses and grains */
  {
    id: 'oats',
    name: { de: 'Haferflocken', en: 'Rolled oats' },
    unit: 'g',
    category: 'grains',
    fresh: false,
    mentions: { de: ['Haferflocke'], en: ['oats'] },
  },
  {
    id: 'bread',
    name: { de: 'Vollkornbrot', en: 'Wholemeal bread' },
    unit: 'g',
    category: 'grains',
    fresh: true,
    mentions: { de: ['Brot', 'Vollkornbrot'], en: ['bread'] },
  },
  {
    id: 'wrap',
    name: { de: 'Vollkorn-Wrap', en: 'Wholemeal wrap' },
    unit: 'piece',
    category: 'grains',
    fresh: true,
    mentions: { de: ['Wrap'], en: ['wrap'] },
  },
  {
    id: 'pasta',
    name: { de: 'Vollkornnudeln', en: 'Wholemeal pasta' },
    unit: 'g',
    category: 'grains',
    fresh: false,
    mentions: { de: ['Nudel'], en: ['pasta'] },
  },
  {
    id: 'rice',
    name: { de: 'Vollkornreis', en: 'Wholegrain rice' },
    unit: 'g',
    category: 'grains',
    fresh: false,
    mentions: { de: ['Reis'], en: ['rice'] },
  },
  {
    id: 'quinoa',
    name: { de: 'Quinoa', en: 'Quinoa' },
    unit: 'g',
    category: 'grains',
    fresh: false,
    mentions: { de: ['Quinoa'], en: ['quinoa'] },
  },
  {
    id: 'lentils',
    name: { de: 'Linsen (getrocknet)', en: 'Lentils (dried)' },
    unit: 'g',
    category: 'grains',
    fresh: false,
    mentions: { de: ['Linse'], en: ['lentil'] },
  },
  {
    id: 'chickpeas',
    name: { de: 'Kichererbsen', en: 'Chickpeas' },
    unit: 'can',
    category: 'grains',
    fresh: false,
    mentions: { de: ['Kichererbse'], en: ['chickpeas'] },
  },
  {
    id: 'kidney-beans',
    name: { de: 'Kidneybohnen', en: 'Kidney beans' },
    unit: 'can',
    category: 'grains',
    fresh: false,
    mentions: { de: ['Kidneybohne'], en: ['kidney bean'] },
  },
  {
    id: 'white-beans',
    name: { de: 'Weiße Bohnen', en: 'White beans' },
    unit: 'can',
    category: 'grains',
    fresh: false,
    mentions: { de: ['weiße Bohne'], en: ['white bean'] },
  },
  {
    id: 'chickpea-flour',
    name: { de: 'Kichererbsenmehl', en: 'Chickpea flour' },
    unit: 'g',
    category: 'grains',
    fresh: false,
    mentions: { de: ['Kichererbsenmehl'], en: ['chickpea flour'] },
  },

  /* ------------------------------------------------- nuts and spreadables */
  {
    id: 'nuts',
    name: { de: 'Mandeln & Walnüsse', en: 'Almonds & walnuts' },
    unit: 'g',
    category: 'nuts',
    fresh: false,
    mentions: { de: ['Nüsse', 'Walnüsse', 'Mandel'], en: ['nuts', 'walnut', 'almond'] },
  },
  {
    id: 'pumpkin-seeds',
    name: { de: 'Kürbiskerne', en: 'Pumpkin seeds' },
    unit: 'g',
    category: 'nuts',
    fresh: false,
    mentions: { de: ['Kürbiskern'], en: ['pumpkin seed'] },
  },
  {
    id: 'flaxseed',
    name: { de: 'Leinsamen, geschrotet', en: 'Ground flaxseed' },
    unit: 'g',
    category: 'nuts',
    fresh: false,
    mentions: { de: ['Leinsamen'], en: ['flaxseed'] },
  },
  {
    id: 'peanut-butter',
    name: { de: 'Erdnussmus', en: 'Peanut butter' },
    unit: 'g',
    category: 'nuts',
    fresh: false,
    mentions: { de: ['Erdnussmus'], en: ['peanut butter'] },
  },
  {
    id: 'hummus',
    name: { de: 'Hummus', en: 'Hummus' },
    unit: 'g',
    category: 'nuts',
    fresh: true,
    mentions: { de: ['Hummus'], en: ['hummus'] },
  },
  {
    id: 'trail-mix',
    name: { de: 'Studentenfutter', en: 'Trail mix' },
    unit: 'g',
    category: 'nuts',
    fresh: false,
    mentions: { de: ['Studentenfutter'], en: ['trail mix'] },
  },
  {
    id: 'edamame',
    name: { de: 'Edamame (TK)', en: 'Edamame (frozen)' },
    unit: 'g',
    category: 'nuts',
    fresh: true,
    mentions: { de: ['Edamame'], en: ['edamame'] },
  },

  /* ------------------------------------------------------- store cupboard */
  {
    id: 'coconut-milk',
    name: { de: 'Kokosmilch', en: 'Coconut milk' },
    unit: 'can',
    category: 'cupboard',
    fresh: false,
    mentions: { de: ['Kokosmilch'], en: ['coconut milk'] },
  },
  {
    id: 'sieved-tomatoes',
    name: { de: 'Passierte Tomaten', en: 'Sieved tomatoes' },
    unit: 'can',
    category: 'cupboard',
    fresh: false,
    mentions: { de: ['passierte Tomate'], en: ['sieved tomato'] },
  },
];

/**
 * Cupboard staples, listed separately from the recipe ingredients because they
 * do not scale with the number of people.
 *
 * Three of these — soy sauce, curry powder and dried herbs — are here because
 * the method steps of the imported recipes called for them while nothing on the
 * shopping list did. That is the same class of gap `unlistedMentions()` now
 * catches automatically.
 */
export const STAPLES: readonly Staple[] = [
  {
    id: 'oil',
    name: { de: 'Olivenöl', en: 'Olive oil' },
    note: { de: '1 Flasche', en: '1 bottle' },
    mentions: { de: ['Öl', 'Olivenöl'], en: ['oil', 'olive oil'] },
  },
  {
    id: 'stock',
    name: { de: 'Gemüsebrühe', en: 'Vegetable stock' },
    note: { de: '1 Packung', en: '1 packet' },
    mentions: { de: ['Gemüsebrühe', 'Brühe'], en: ['vegetable stock', 'stock'] },
  },
  {
    id: 'spices',
    name: { de: 'Kurkuma, Zimt, jodiertes Salz', en: 'Turmeric, cinnamon, iodised salt' },
    note: { de: 'Vorrat prüfen', en: 'Check what you have' },
    mentions: {
      de: ['Kurkuma', 'Zimt', 'Salz', 'salzen', 'Pfeffer', 'Gewürz'],
      en: ['turmeric', 'cinnamon', 'salt', 'pepper', 'spice'],
    },
  },
  {
    id: 'soy-sauce',
    name: { de: 'Sojasauce', en: 'Soy sauce' },
    note: { de: '1 Flasche', en: '1 bottle' },
    mentions: { de: ['Sojasauce'], en: ['soy sauce'] },
  },
  {
    id: 'curry-powder',
    name: { de: 'Currypulver', en: 'Curry powder' },
    note: { de: '1 Packung', en: '1 packet' },
    mentions: { de: ['Curry'], en: ['curry'] },
  },
  {
    id: 'dried-herbs',
    name: {
      de: 'Getrocknete Kräuter (Oregano, Basilikum)',
      en: 'Dried herbs (oregano, basil)',
    },
    note: { de: '1 Packung', en: '1 packet' },
    mentions: {
      de: ['Oregano', 'Basilikum', 'Kräuter'],
      en: ['oregano', 'basil', 'herb'],
    },
  },
  {
    id: 'kala-namak',
    name: { de: 'Kala-Namak-Salz (optional)', en: 'Kala namak salt (optional)' },
    note: { de: '1 kleine Packung', en: '1 small packet' },
    mentions: { de: ['Kala-Namak'], en: ['kala namak'] },
  },
  {
    id: 'tahini',
    name: { de: 'Tahin (optional, für Dressings)', en: 'Tahini (optional, for dressings)' },
    note: { de: '1 Glas', en: '1 jar' },
    mentions: { de: ['Tahin'], en: ['tahini'] },
  },
  {
    id: 'b12',
    name: { de: 'Vitamin B12', en: 'Vitamin B12' },
    note: { de: 'Tropfen oder Tabletten', en: 'Drops or tablets' },
    mentions: { de: [], en: [] },
  },
  {
    id: 'algae-oil',
    name: { de: 'Algenöl (Omega-3)', en: 'Algae oil (omega-3)' },
    note: { de: '1 Flasche', en: '1 bottle' },
    mentions: { de: ['Algenöl'], en: ['algae oil'] },
  },
];

export const RECIPES: readonly Recipe[] = [
  /* ------------------------------------------------------------ breakfast */
  {
    id: 'porridge-berries',
    meal: 'breakfast',
    name: {
      de: 'Porridge mit Beeren & Walnüssen',
      en: 'Porridge with berries & walnuts',
    },
    ingredients: [
      { id: 'oats', perPerson: 60 },
      { id: 'plant-milk', perPerson: 280 },
      { id: 'berries', perPerson: 100 },
      { id: 'flaxseed', perPerson: 10 },
      { id: 'nuts', perPerson: 20 },
    ],
    steps: {
      de: [
        'Haferflocken mit Pflanzenmilch in einem Topf verrühren und aufkochen.',
        'Bei mittlerer Hitze 5 Minuten köcheln lassen, bis die Masse cremig ist.',
        'In eine Schüssel füllen und mit Beeren, Leinsamen und Walnüssen toppen.',
      ],
      en: [
        'Stir the oats into the plant milk in a pan and bring to the boil.',
        'Simmer over a medium heat for 5 minutes, until creamy.',
        'Pour into a bowl and top with the berries, flaxseed and walnuts.',
      ],
    },
  },
  {
    id: 'tofu-scramble-spinach',
    meal: 'breakfast',
    name: { de: 'Tofu-Rührei mit Spinat', en: 'Tofu scramble with spinach' },
    ingredients: [
      { id: 'silken-tofu', perPerson: 180 },
      { id: 'spinach', perPerson: 60 },
      { id: 'bread', perPerson: 90 },
      { id: 'oranges', perPerson: 1 },
    ],
    steps: {
      de: [
        'Seidentofu abtropfen lassen und mit einer Gabel grob zerdrücken.',
        'In einer Pfanne mit etwas Öl und Kurkuma 3–4 Minuten anbraten.',
        'Spinat dazugeben, zusammenfallen lassen und mit Salz und Pfeffer abschmecken.',
        'Mit geröstetem Vollkornbrot und Orangenspalten servieren.',
      ],
      en: [
        'Drain the silken tofu and mash it roughly with a fork.',
        'Fry it in a pan with a little oil and turmeric for 3–4 minutes.',
        'Add the spinach, let it wilt, then season with salt and pepper.',
        'Serve with toasted bread and orange segments.',
      ],
    },
  },
  {
    id: 'yoghurt-bowl-apple',
    meal: 'breakfast',
    name: { de: 'Joghurt-Bowl mit Apfel', en: 'Yoghurt bowl with apple' },
    ingredients: [
      { id: 'plant-yoghurt', perPerson: 250 },
      { id: 'oats', perPerson: 40 },
      { id: 'apples', perPerson: 1 },
      { id: 'pumpkin-seeds', perPerson: 15 },
    ],
    steps: {
      de: [
        'Apfel waschen und in kleine Würfel schneiden.',
        'Pflanzenjoghurt mit Haferflocken verrühren und kurz quellen lassen.',
        'Mit Apfelwürfeln, Kürbiskernen und etwas Zimt toppen.',
      ],
      en: [
        'Wash the apple and cut it into small cubes.',
        'Stir the plant yoghurt together with the oats and leave it to soak briefly.',
        'Top with the apple cubes, pumpkin seeds and a little cinnamon.',
      ],
    },
  },
  {
    id: 'overnight-oats-banana',
    meal: 'breakfast',
    name: { de: 'Overnight Oats mit Banane', en: 'Overnight oats with banana' },
    ingredients: [
      { id: 'oats', perPerson: 60 },
      { id: 'plant-milk', perPerson: 220 },
      { id: 'bananas', perPerson: 1 },
      { id: 'peanut-butter', perPerson: 25 },
    ],
    steps: {
      de: [
        'Haferflocken mit Pflanzenmilch und Erdnussmus in einem Glas verrühren.',
        'Abgedeckt über Nacht im Kühlschrank quellen lassen.',
        'Am Morgen mit der in Scheiben geschnittenen Banane toppen.',
      ],
      en: [
        'Stir the oats, plant milk and peanut butter together in a jar.',
        'Cover and leave to soak in the fridge overnight.',
        'In the morning, top with the sliced banana.',
      ],
    },
  },
  {
    id: 'bread-avocado-hummus',
    meal: 'breakfast',
    name: { de: 'Brot mit Avocado & Hummus', en: 'Bread with avocado & hummus' },
    ingredients: [
      { id: 'bread', perPerson: 100 },
      { id: 'avocado', perPerson: 0.5 },
      { id: 'hummus', perPerson: 40 },
      { id: 'radishes', perPerson: 0.3 },
      /* The lemon the method has always called for. It was missing from the
         imported ingredient list, so it never reached the shopping list. */
      { id: 'lemon', perPerson: 0.25 },
    ],
    steps: {
      de: [
        'Brot toasten.',
        'Avocado mit einer Gabel zerdrücken und mit Salz, Pfeffer und etwas Zitronensaft abschmecken.',
        'Brot erst mit Hummus, dann mit der Avocado bestreichen.',
        'Mit dünn geschnittenen Radieschen belegen.',
      ],
      en: [
        'Toast the bread.',
        'Mash the avocado with a fork and season it with salt, pepper and a squeeze of lemon juice.',
        'Spread the bread with hummus first, then with the avocado.',
        'Top with thinly sliced radishes.',
      ],
    },
  },
  {
    id: 'chickpea-omelette',
    meal: 'breakfast',
    name: { de: 'Kichererbsen-Omelett', en: 'Chickpea omelette' },
    ingredients: [
      { id: 'chickpea-flour', perPerson: 70 },
      { id: 'bell-pepper', perPerson: 0.5 },
      { id: 'tomatoes', perPerson: 1 },
      { id: 'cheese', perPerson: 40 },
      { id: 'bread', perPerson: 50 },
    ],
    steps: {
      de: [
        'Kichererbsenmehl mit Wasser zu einem glatten, dünnflüssigen Teig verrühren und würzen.',
        'Paprika und Tomate klein würfeln und unterrühren.',
        'In einer beschichteten Pfanne von beiden Seiten goldbraun braten.',
        'Mit veganem Käse bestreuen und mit Vollkornbrot servieren.',
      ],
      en: [
        'Whisk the chickpea flour with water into a smooth, thin batter and season it.',
        'Dice the bell pepper and tomato finely and stir them in.',
        'Fry in a non-stick pan until golden on both sides.',
        'Scatter the vegan cheese over the top and serve with bread.',
      ],
    },
  },

  /* ----------------------------------------------------------------- lunch */
  {
    id: 'lentil-vegetable-stew',
    meal: 'lunch',
    name: { de: 'Linsen-Gemüse-Eintopf', en: 'Lentil and vegetable stew' },
    ingredients: [
      { id: 'lentils', perPerson: 120 },
      { id: 'carrots', perPerson: 120 },
      { id: 'onions', perPerson: 0.5 },
      { id: 'bread', perPerson: 50 },
    ],
    steps: {
      de: [
        'Zwiebel und Karotten klein schneiden und kurz andünsten.',
        'Linsen dazugeben und mit Gemüsebrühe bedecken.',
        '20–25 Minuten köcheln lassen, bis die Linsen weich sind.',
        'Abschmecken und mit Vollkornbrot servieren.',
      ],
      en: [
        'Chop the onion and carrots and sweat them briefly.',
        'Add the lentils and cover them with vegetable stock.',
        'Simmer for 20–25 minutes, until the lentils are soft.',
        'Season to taste and serve with bread.',
      ],
    },
  },
  {
    id: 'roast-vegetables-quinoa',
    meal: 'lunch',
    name: {
      de: 'Ofengemüse mit Kichererbsen & Quinoa',
      en: 'Roast vegetables with chickpeas & quinoa',
    },
    ingredients: [
      { id: 'sweet-potato', perPerson: 180 },
      { id: 'broccoli', perPerson: 120 },
      { id: 'bell-pepper', perPerson: 1 },
      { id: 'chickpeas', perPerson: 0.7 },
      { id: 'quinoa', perPerson: 75 },
    ],
    steps: {
      de: [
        'Ofen auf 200 °C vorheizen. Süßkartoffel, Brokkoli und Paprika in Stücke schneiden.',
        'Mit Kichererbsen, Öl und Gewürzen mischen und 20–25 Minuten rösten.',
        'Parallel Quinoa nach Packungsangabe kochen.',
        'Alles zusammen anrichten.',
      ],
      en: [
        'Heat the oven to 200 °C. Cut the sweet potato, broccoli and bell pepper into chunks.',
        'Toss them with the chickpeas, oil and spices and roast for 20–25 minutes.',
        'Meanwhile cook the quinoa according to the packet.',
        'Serve everything together.',
      ],
    },
  },
  {
    id: 'pasta-lentil-bolognese',
    meal: 'lunch',
    name: {
      de: 'Nudeln mit Tomaten-Linsen-Bolognese',
      en: 'Pasta with tomato and lentil bolognese',
    },
    ingredients: [
      { id: 'pasta', perPerson: 110 },
      { id: 'sieved-tomatoes', perPerson: 0.6 },
      { id: 'lentils', perPerson: 70 },
      { id: 'onions', perPerson: 0.5 },
    ],
    steps: {
      de: [
        'Nudeln nach Packungsangabe kochen.',
        'Zwiebel andünsten, dann Linsen und passierte Tomaten dazugeben.',
        '15 Minuten köcheln lassen und mit Oregano und Basilikum würzen.',
        'Über die Nudeln geben.',
      ],
      en: [
        'Cook the pasta according to the packet.',
        'Sweat the onion, then add the lentils and the sieved tomatoes.',
        'Simmer for 15 minutes and season with oregano and basil.',
        'Spoon it over the pasta.',
      ],
    },
  },
  {
    id: 'quinoa-salad-feta',
    meal: 'lunch',
    name: { de: 'Quinoa-Salat mit Feta', en: 'Quinoa salad with feta' },
    ingredients: [
      { id: 'quinoa', perPerson: 75 },
      { id: 'feta', perPerson: 50 },
      { id: 'cucumber', perPerson: 0.5 },
      { id: 'tomatoes', perPerson: 1 },
      { id: 'chickpeas', perPerson: 0.5 },
      { id: 'lemon', perPerson: 0.5 },
    ],
    steps: {
      de: [
        'Quinoa kochen und abkühlen lassen.',
        'Gurke und Tomate würfeln und mit Quinoa und Kichererbsen mischen.',
        'Veganen Feta darüberbröseln.',
        'Mit Zitronensaft, Olivenöl, Salz und Pfeffer abschmecken.',
      ],
      en: [
        'Cook the quinoa and leave it to cool.',
        'Dice the cucumber and tomato and mix them with the quinoa and chickpeas.',
        'Crumble the vegan feta over the top.',
        'Dress with lemon juice, olive oil, salt and pepper.',
      ],
    },
  },
  {
    id: 'coconut-curry',
    meal: 'lunch',
    name: { de: 'Gemüse-Kokos-Curry', en: 'Vegetable coconut curry' },
    ingredients: [
      { id: 'bell-pepper', perPerson: 1 },
      { id: 'broccoli', perPerson: 120 },
      { id: 'kidney-beans', perPerson: 0.7 },
      { id: 'coconut-milk', perPerson: 0.6 },
      { id: 'rice', perPerson: 90 },
    ],
    steps: {
      de: [
        'Paprika und Brokkoli klein schneiden und mit Currypulver anbraten.',
        'Kokosmilch und Kidneybohnen dazugeben und 10–15 Minuten köcheln lassen.',
        'Reis parallel nach Packungsangabe kochen.',
        'Das Curry über den Reis geben.',
      ],
      en: [
        'Chop the bell pepper and broccoli and fry them with curry powder.',
        'Add the coconut milk and kidney beans and simmer for 10–15 minutes.',
        'Cook the rice alongside, following the packet.',
        'Spoon the curry over the rice.',
      ],
    },
  },
  {
    id: 'baked-tofu-vegetables',
    meal: 'lunch',
    name: { de: 'Gebackener Tofu mit Ofengemüse', en: 'Baked tofu with roast vegetables' },
    ingredients: [
      { id: 'firm-tofu', perPerson: 180 },
      { id: 'potatoes', perPerson: 220 },
      { id: 'broccoli', perPerson: 120 },
      { id: 'bell-pepper', perPerson: 0.5 },
    ],
    steps: {
      de: [
        'Tofu würfeln und mit Sojasauce, Öl und Gewürzen marinieren.',
        'Kartoffeln, Brokkoli und Paprika in Stücke schneiden.',
        'Alles auf einem Blech verteilen und bei 200 °C etwa 25 Minuten backen, einmal wenden.',
      ],
      en: [
        'Cube the tofu and marinate it in soy sauce, oil and spices.',
        'Cut the potatoes, broccoli and bell pepper into chunks.',
        'Spread everything on a tray and bake at 200 °C for about 25 minutes, turning once.',
      ],
    },
  },
  {
    id: 'stuffed-peppers',
    meal: 'lunch',
    name: { de: 'Gefüllte Paprika', en: 'Stuffed peppers' },
    ingredients: [
      { id: 'bell-pepper', perPerson: 2 },
      { id: 'lentils', perPerson: 70 },
      { id: 'rice', perPerson: 65 },
    ],
    steps: {
      de: [
        'Reis und Linsen getrennt vorkochen.',
        'Paprika halbieren und entkernen.',
        'Mit der Reis-Linsen-Mischung füllen und würzen.',
        'Bei 190 °C etwa 25 Minuten backen.',
      ],
      en: [
        'Pre-cook the rice and the lentils separately.',
        'Halve the bell peppers and remove the seeds.',
        'Fill them with the rice and lentil mixture and season.',
        'Bake at 190 °C for about 25 minutes.',
      ],
    },
  },

  /* ---------------------------------------------------------------- dinner */
  {
    id: 'vegetable-soup-chickpeas',
    meal: 'dinner',
    name: { de: 'Gemüsesuppe mit Kichererbsen', en: 'Vegetable soup with chickpeas' },
    ingredients: [
      { id: 'carrots', perPerson: 120 },
      { id: 'onions', perPerson: 0.5 },
      { id: 'chickpeas', perPerson: 0.5 },
      { id: 'ginger', perPerson: 10 },
    ],
    steps: {
      de: [
        'Zwiebel, Karotten und Ingwer klein schneiden und kurz andünsten.',
        'Mit Gemüsebrühe aufgießen und 15 Minuten köcheln lassen.',
        'Kichererbsen dazugeben und weitere 5 Minuten köcheln lassen.',
        'Nach Wunsch pürieren oder stückig lassen.',
      ],
      en: [
        'Chop the onion, carrots and ginger and sweat them briefly.',
        'Pour in vegetable stock and simmer for 15 minutes.',
        'Add the chickpeas and simmer for another 5 minutes.',
        'Blend it smooth or leave it chunky, as you prefer.',
      ],
    },
  },
  {
    id: 'wrap-hummus',
    meal: 'dinner',
    name: { de: 'Vollkorn-Wrap mit Hummus', en: 'Wholemeal wrap with hummus' },
    ingredients: [
      { id: 'wrap', perPerson: 1 },
      { id: 'hummus', perPerson: 50 },
      { id: 'bell-pepper', perPerson: 0.5 },
      { id: 'cucumber', perPerson: 0.5 },
      { id: 'feta', perPerson: 40 },
    ],
    steps: {
      de: [
        'Wrap mit Hummus bestreichen.',
        'Paprika und Gurke in Streifen schneiden und auflegen.',
        'Veganen Feta darüberbröseln und aufrollen.',
      ],
      en: [
        'Spread the wrap with hummus.',
        'Cut the bell pepper and cucumber into strips and lay them on.',
        'Crumble the vegan feta over the top and roll it up.',
      ],
    },
  },
  {
    id: 'squash-carrot-soup',
    meal: 'dinner',
    name: { de: 'Kürbis-Möhren-Suppe', en: 'Squash and carrot soup' },
    ingredients: [
      { id: 'squash', perPerson: 230 },
      { id: 'carrots', perPerson: 120 },
      { id: 'ginger', perPerson: 10 },
      { id: 'coconut-milk', perPerson: 0.5 },
    ],
    steps: {
      de: [
        'Kürbis und Karotten schälen und würfeln.',
        'Mit Ingwer andünsten und mit Gemüsebrühe bedecken.',
        '20 Minuten köcheln lassen, bis alles weich ist.',
        'Mit Kokosmilch pürieren und abschmecken.',
      ],
      en: [
        'Peel and dice the squash and carrots.',
        'Sweat them with the ginger, then cover with vegetable stock.',
        'Simmer for 20 minutes, until everything is soft.',
        'Blend with the coconut milk and season to taste.',
      ],
    },
  },
  {
    id: 'white-bean-salad',
    meal: 'dinner',
    name: { de: 'Salat mit weißen Bohnen', en: 'Salad with white beans' },
    ingredients: [
      { id: 'white-beans', perPerson: 0.7 },
      /* The salad leaves the method mixes everything into. Another ingredient
         that the imported version cooked with but never bought. */
      { id: 'salad-leaves', perPerson: 60 },
      { id: 'feta', perPerson: 40 },
      { id: 'nuts', perPerson: 20 },
      { id: 'lemon', perPerson: 0.5 },
    ],
    steps: {
      de: [
        'Weiße Bohnen abspülen und abtropfen lassen.',
        'Blattsalat waschen und mit den Bohnen, veganem Feta und Walnüssen mischen.',
        'Mit Zitronensaft, Olivenöl, Salz und Pfeffer anmachen.',
      ],
      en: [
        'Rinse and drain the white beans.',
        'Wash the salad leaves and toss them with the beans, vegan feta and walnuts.',
        'Dress with lemon juice, olive oil, salt and pepper.',
      ],
    },
  },
  {
    id: 'tofu-stir-fry',
    meal: 'dinner',
    name: { de: 'Gemüsepfanne mit Tofu', en: 'Vegetable stir-fry with tofu' },
    ingredients: [
      { id: 'firm-tofu', perPerson: 180 },
      { id: 'broccoli', perPerson: 120 },
      { id: 'bell-pepper', perPerson: 0.5 },
      { id: 'rice', perPerson: 90 },
    ],
    steps: {
      de: [
        'Tofu würfeln, knusprig anbraten und herausnehmen.',
        'Brokkoli und Paprika in derselben Pfanne anbraten.',
        'Tofu wieder dazugeben und mit Sojasauce würzen.',
        'Mit gekochtem Reis servieren.',
      ],
      en: [
        'Cube the tofu, fry it until crisp and lift it out.',
        'Fry the broccoli and bell pepper in the same pan.',
        'Return the tofu to the pan and season with soy sauce.',
        'Serve with the cooked rice.',
      ],
    },
  },
  {
    id: 'tofu-scramble-evening',
    meal: 'dinner',
    name: {
      de: 'Tofu-Rührei mit Spinat (abends)',
      en: 'Tofu scramble with spinach (evening)',
    },
    ingredients: [
      { id: 'silken-tofu', perPerson: 180 },
      { id: 'spinach', perPerson: 60 },
      { id: 'bread', perPerson: 90 },
    ],
    steps: {
      de: [
        'Seidentofu zerdrücken und mit Kurkuma und Gewürzen anbraten.',
        'Spinat unterheben und zusammenfallen lassen.',
        'Mit geröstetem Vollkornbrot servieren.',
      ],
      en: [
        'Mash the silken tofu and fry it with turmeric and spices.',
        'Fold in the spinach and let it wilt.',
        'Serve with toasted bread.',
      ],
    },
  },

  /* ----------------------------------------------------------------- snack */
  {
    id: 'nuts-apple',
    meal: 'snack',
    name: { de: 'Nüsse & Apfel', en: 'Nuts & apple' },
    ingredients: [
      { id: 'nuts', perPerson: 25 },
      { id: 'apples', perPerson: 1 },
    ],
    steps: {
      de: ['Apfel waschen und in Spalten schneiden.', 'Zusammen mit den Nüssen servieren.'],
      en: ['Wash the apple and cut it into wedges.', 'Serve it with the nuts.'],
    },
  },
  {
    id: 'yoghurt-berries',
    meal: 'snack',
    name: { de: 'Joghurt & Beeren', en: 'Yoghurt & berries' },
    ingredients: [
      { id: 'plant-yoghurt', perPerson: 180 },
      { id: 'berries', perPerson: 60 },
    ],
    steps: {
      de: ['Pflanzenjoghurt in eine Schüssel geben.', 'Mit Beeren toppen.'],
      en: ['Spoon the plant yoghurt into a bowl.', 'Top it with the berries.'],
    },
  },
  {
    id: 'veg-sticks-hummus',
    meal: 'snack',
    name: { de: 'Gemüsesticks & Hummus', en: 'Veg sticks & hummus' },
    ingredients: [
      { id: 'carrots', perPerson: 60 },
      { id: 'cucumber', perPerson: 0.5 },
      { id: 'hummus', perPerson: 35 },
    ],
    steps: {
      de: ['Karotten und Gurke in Sticks schneiden.', 'Mit Hummus zum Dippen servieren.'],
      en: ['Cut the carrots and cucumber into sticks.', 'Serve with hummus for dipping.'],
    },
  },
  {
    id: 'banana-peanut-butter',
    meal: 'snack',
    name: { de: 'Banane & Erdnussmus', en: 'Banana & peanut butter' },
    ingredients: [
      { id: 'bananas', perPerson: 1 },
      { id: 'peanut-butter', perPerson: 20 },
    ],
    steps: {
      de: ['Banane längs halbieren.', 'Mit Erdnussmus bestreichen.'],
      en: ['Halve the banana lengthways.', 'Spread it with peanut butter.'],
    },
  },
  {
    id: 'trail-mix',
    meal: 'snack',
    name: { de: 'Studentenfutter', en: 'Trail mix' },
    ingredients: [{ id: 'trail-mix', perPerson: 35 }],
    steps: {
      de: ['Eine Portion Studentenfutter abwiegen und griffbereit mitnehmen.'],
      en: ['Weigh out a portion of trail mix and take it with you.'],
    },
  },
  {
    id: 'hummus-cherry-edamame',
    meal: 'snack',
    name: { de: 'Hummus, Cherrytomaten & Edamame', en: 'Hummus, cherry tomatoes & edamame' },
    ingredients: [
      { id: 'hummus', perPerson: 35 },
      { id: 'cherry-tomatoes', perPerson: 60 },
      { id: 'edamame', perPerson: 60 },
    ],
    steps: {
      de: [
        'Edamame kurz kochen oder auftauen und leicht salzen.',
        'Zusammen mit Cherrytomaten und Hummus anrichten.',
      ],
      en: [
        'Boil or thaw the edamame briefly and salt it lightly.',
        'Arrange it with the cherry tomatoes and hummus.',
      ],
    },
  },
];
