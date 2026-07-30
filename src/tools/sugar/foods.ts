import type { Locale } from '../../i18n/index.js';

/**
 * Reference foods, with typical total sugar per 100 g.
 *
 * The figures are approximate values for a typical example of each food, in the
 * same spirit as the printed tables these were taken from; brands and growing
 * conditions move them around by a gram or two. They are here to give a sense of
 * scale, not to support a diet plan, and the UI says as much.
 *
 * Names live with the data rather than in the translation catalogue: this is a
 * dataset with a localised label per row, not UI chrome, and keeping the pairs
 * together makes it impossible to add a food in one language only.
 */
export interface Food {
  /** Stable identifier, independent of either language. */
  readonly id: string;
  /** Grams of sugar per 100 g of the food. */
  readonly sugarPer100g: number;
  readonly name: Readonly<Record<Locale, string>>;
}

/** Sorted by sugar content. `FOODS` is exported already sorted; see the test. */
export const FOODS: readonly Food[] = [
  { id: 'water', sugarPer100g: 0, name: { de: 'Wasser', en: 'Water' } },
  {
    id: 'black-coffee',
    sugarPer100g: 0,
    name: { de: 'Schwarzer Kaffee (ungesüßt)', en: 'Black coffee (unsweetened)' },
  },
  { id: 'beer', sugarPer100g: 0, name: { de: 'Bier (Pils)', en: 'Beer (pilsner)' } },
  { id: 'spinach', sugarPer100g: 0.5, name: { de: 'Spinat (frisch)', en: 'Spinach (fresh)' } },
  { id: 'avocado', sugarPer100g: 0.7, name: { de: 'Avocado', en: 'Avocado' } },
  { id: 'cucumber', sugarPer100g: 1.5, name: { de: 'Gurke', en: 'Cucumber' } },
  { id: 'courgette', sugarPer100g: 1.7, name: { de: 'Zucchini', en: 'Courgette' } },
  { id: 'green-pepper', sugarPer100g: 2.4, name: { de: 'Paprika (grün)', en: 'Pepper (green)' } },
  { id: 'lemon', sugarPer100g: 2.5, name: { de: 'Zitrone', en: 'Lemon' } },
  { id: 'tomato', sugarPer100g: 2.6, name: { de: 'Tomate', en: 'Tomato' } },
  { id: 'blackberry', sugarPer100g: 2.7, name: { de: 'Brombeere', en: 'Blackberry' } },
  {
    id: 'pizza-margherita',
    sugarPer100g: 3.1,
    name: { de: 'Pizza Margherita (tiefgekühlt)', en: 'Pizza Margherita (frozen)' },
  },
  {
    id: 'white-bread',
    sugarPer100g: 3.5,
    name: { de: 'Toastbrot (Weißbrot)', en: 'White sliced bread' },
  },
  { id: 'onion', sugarPer100g: 4.3, name: { de: 'Zwiebel', en: 'Onion' } },
  { id: 'carrot', sugarPer100g: 4.7, name: { de: 'Karotte (Möhre)', en: 'Carrot' } },
  { id: 'raspberry', sugarPer100g: 4.8, name: { de: 'Himbeere', en: 'Raspberry' } },
  {
    id: 'whole-milk',
    sugarPer100g: 4.9,
    name: { de: 'Vollmilch (3,5 % Fett)', en: 'Whole milk (3.5% fat)' },
  },
  { id: 'strawberry', sugarPer100g: 4.9, name: { de: 'Erdbeere', en: 'Strawberry' } },
  {
    id: 'redcurrant',
    sugarPer100g: 7.3,
    name: { de: 'Johannisbeere (rot)', en: 'Redcurrant' },
  },
  {
    id: 'blueberry',
    sugarPer100g: 7.4,
    name: { de: 'Heidelbeere (Blaubeere)', en: 'Blueberry' },
  },
  { id: 'apricot', sugarPer100g: 8.5, name: { de: 'Aprikose', en: 'Apricot' } },
  { id: 'peach', sugarPer100g: 8.9, name: { de: 'Pfirsich', en: 'Peach' } },
  { id: 'grapefruit', sugarPer100g: 8.9, name: { de: 'Grapefruit', en: 'Grapefruit' } },
  { id: 'orange', sugarPer100g: 9.2, name: { de: 'Orange', en: 'Orange' } },
  { id: 'mandarin', sugarPer100g: 10.1, name: { de: 'Mandarine', en: 'Mandarin' } },
  { id: 'plum', sugarPer100g: 10.2, name: { de: 'Pflaume', en: 'Plum' } },
  { id: 'cola', sugarPer100g: 10.6, name: { de: 'Cola (normal)', en: 'Cola (regular)' } },
  { id: 'sour-cherry', sugarPer100g: 11, name: { de: 'Sauerkirsche', en: 'Sour cherry' } },
  { id: 'energy-drink', sugarPer100g: 11, name: { de: 'Energydrink', en: 'Energy drink' } },
  { id: 'apple', sugarPer100g: 11.4, name: { de: 'Apfel', en: 'Apple' } },
  {
    id: 'apple-juice',
    sugarPer100g: 11.7,
    name: { de: 'Apfelsaft (100 % Fruchtsaft)', en: 'Apple juice (100% fruit)' },
  },
  { id: 'banana', sugarPer100g: 12.2, name: { de: 'Banane', en: 'Banana' } },
  { id: 'pear', sugarPer100g: 12.4, name: { de: 'Birne', en: 'Pear' } },
  { id: 'nectarine', sugarPer100g: 12.4, name: { de: 'Nektarine', en: 'Nectarine' } },
  { id: 'mango', sugarPer100g: 12.8, name: { de: 'Mango', en: 'Mango' } },
  { id: 'pineapple', sugarPer100g: 13.1, name: { de: 'Ananas', en: 'Pineapple' } },
  { id: 'sweet-cherry', sugarPer100g: 13.3, name: { de: 'Süßkirsche', en: 'Sweet cherry' } },
  {
    id: 'passion-fruit',
    sugarPer100g: 13.4,
    name: { de: 'Maracuja (Passionsfrucht)', en: 'Passion fruit' },
  },
  { id: 'mirabelle', sugarPer100g: 14, name: { de: 'Mirabelle', en: 'Mirabelle plum' } },
  { id: 'grapes', sugarPer100g: 15.6, name: { de: 'Weintraube', en: 'Grapes' } },
  { id: 'pomegranate', sugarPer100g: 16.7, name: { de: 'Granatapfel', en: 'Pomegranate' } },
  { id: 'ketchup', sugarPer100g: 22.8, name: { de: 'Ketchup', en: 'Ketchup' } },
  {
    id: 'dark-chocolate',
    sugarPer100g: 29.7,
    name: { de: 'Zartbitterschokolade (70 %)', en: 'Dark chocolate (70%)' },
  },
  { id: 'gummy-bears', sugarPer100g: 46, name: { de: 'Gummibärchen', en: 'Gummy bears' } },
  { id: 'milk-chocolate', sugarPer100g: 47, name: { de: 'Milchschokolade', en: 'Milk chocolate' } },
  {
    id: 'hazelnut-spread',
    sugarPer100g: 56.3,
    name: { de: 'Nuss-Nougat-Creme', en: 'Chocolate hazelnut spread' },
  },
  { id: 'raisins', sugarPer100g: 59.2, name: { de: 'Rosinen', en: 'Raisins' } },
  { id: 'jam', sugarPer100g: 62, name: { de: 'Marmelade (Konfitüre)', en: 'Jam' } },
  { id: 'honey', sugarPer100g: 80, name: { de: 'Honig', en: 'Honey' } },
  {
    id: 'table-sugar',
    sugarPer100g: 99.8,
    name: { de: 'Haushaltszucker (Saccharose)', en: 'Table sugar (sucrose)' },
  },
];
