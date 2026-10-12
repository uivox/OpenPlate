import type { Food } from './types';

/**
 * Built-in basic foods, values per 100 g / 100 ml.
 * Approximate averages compiled from public nutrition references (USDA FoodData Central,
 * German food labels). Open Food Facts covers packaged products; this list covers the
 * unpackaged basics it is thin on.
 *
 * Row: id, English name, German name, kcal, protein, carbs, fat, fiber, sugar, unit, servings
 * Serving: [English label, German label, grams]
 */
type ServingRow = [string, string, number];
type Row = [string, string, string, number, number, number, number, number, number, 'g' | 'ml', ServingRow[]?];

const ROWS: Row[] = [
  // Fruit
  ['apple', 'Apple', 'Apfel', 52, 0.3, 14, 0.2, 2.4, 10.4, 'g', [['1 medium', '1 mittelgroßer', 180]]],
  ['banana', 'Banana', 'Banane', 89, 1.1, 22.8, 0.3, 2.6, 12.2, 'g', [['1 medium', '1 mittelgroße', 120]]],
  ['orange', 'Orange', 'Orange', 47, 0.9, 11.8, 0.1, 2.4, 9.4, 'g', [['1 medium', '1 mittelgroße', 150]]],
  ['strawberries', 'Strawberries', 'Erdbeeren', 32, 0.7, 7.7, 0.3, 2, 4.9, 'g', [['1 bowl', '1 Schale', 150]]],
  ['blueberries', 'Blueberries', 'Heidelbeeren', 57, 0.7, 14.5, 0.3, 2.4, 10, 'g', [['1 handful', '1 Handvoll', 75]]],
  ['grapes', 'Grapes', 'Weintrauben', 69, 0.7, 18.1, 0.2, 0.9, 15.5, 'g', [['1 handful', '1 Handvoll', 80]]],
  ['pear', 'Pear', 'Birne', 57, 0.4, 15.2, 0.1, 3.1, 9.8, 'g', [['1 medium', '1 mittelgroße', 180]]],
  ['kiwi', 'Kiwi', 'Kiwi', 61, 1.1, 14.7, 0.5, 3, 9, 'g', [['1 piece', '1 Stück', 75]]],
  ['mango', 'Mango', 'Mango', 60, 0.8, 15, 0.4, 1.6, 13.7, 'g', [['1 cup', '1 Tasse', 165]]],
  ['pineapple', 'Pineapple', 'Ananas', 50, 0.5, 13.1, 0.1, 1.4, 9.9, 'g', [['1 slice', '1 Scheibe', 85]]],
  ['watermelon', 'Watermelon', 'Wassermelone', 30, 0.6, 7.6, 0.2, 0.4, 6.2, 'g', [['1 slice', '1 Scheibe', 280]]],
  ['avocado', 'Avocado', 'Avocado', 160, 2, 8.5, 14.7, 6.7, 0.7, 'g', [['½ avocado', '½ Avocado', 70]]],
  ['raspberries', 'Raspberries', 'Himbeeren', 52, 1.2, 11.9, 0.7, 6.5, 4.4, 'g', [['1 handful', '1 Handvoll', 60]]],
  ['peach', 'Peach', 'Pfirsich', 39, 0.9, 9.5, 0.3, 1.5, 8.4, 'g', [['1 medium', '1 mittelgroßer', 150]]],
  // Vegetables
  ['tomato', 'Tomato', 'Tomate', 18, 0.9, 3.9, 0.2, 1.2, 2.6, 'g', [['1 medium', '1 mittelgroße', 120]]],
  ['cucumber', 'Cucumber', 'Gurke', 15, 0.7, 3.6, 0.1, 0.5, 1.7, 'g', [['½ cucumber', '½ Gurke', 200]]],
  ['carrot', 'Carrot', 'Karotte', 41, 0.9, 9.6, 0.2, 2.8, 4.7, 'g', [['1 medium', '1 mittelgroße', 60]]],
  ['broccoli', 'Broccoli', 'Brokkoli', 34, 2.8, 6.6, 0.4, 2.6, 1.7, 'g', [['1 portion', '1 Portion', 150]]],
  ['bell_pepper', 'Bell pepper', 'Paprika', 31, 1, 6, 0.3, 2.1, 4.2, 'g', [['1 piece', '1 Stück', 150]]],
  ['lettuce', 'Lettuce', 'Blattsalat', 15, 1.4, 2.9, 0.2, 1.3, 0.8, 'g', [['1 bowl', '1 Schale', 50]]],
  ['spinach', 'Spinach', 'Spinat', 23, 2.9, 3.6, 0.4, 2.2, 0.4, 'g', [['1 portion', '1 Portion', 150]]],
  ['potato', 'Potatoes, boiled', 'Kartoffeln, gekocht', 87, 1.9, 20.1, 0.1, 1.8, 0.9, 'g', [['1 medium', '1 mittelgroße', 150]]],
  ['sweet_potato', 'Sweet potato, baked', 'Süßkartoffel, gebacken', 90, 2, 20.7, 0.2, 3.3, 6.5, 'g', [['1 medium', '1 mittelgroße', 150]]],
  ['onion', 'Onion', 'Zwiebel', 40, 1.1, 9.3, 0.1, 1.7, 4.2, 'g', [['1 medium', '1 mittelgroße', 110]]],
  ['zucchini', 'Zucchini', 'Zucchini', 17, 1.2, 3.1, 0.3, 1, 2.5, 'g', [['1 medium', '1 mittelgroße', 200]]],
  ['mushrooms', 'Mushrooms', 'Champignons', 22, 3.1, 3.3, 0.3, 1, 2, 'g', [['1 portion', '1 Portion', 100]]],
  ['corn', 'Sweet corn', 'Mais', 96, 3.4, 21, 1.5, 2.4, 4.5, 'g', [['1 portion', '1 Portion', 80]]],
  ['peas', 'Green peas, cooked', 'Erbsen, gekocht', 84, 5.4, 15.6, 0.2, 5.5, 5.9, 'g', [['1 portion', '1 Portion', 80]]],
  ['cauliflower', 'Cauliflower', 'Blumenkohl', 25, 1.9, 5, 0.3, 2, 1.9, 'g', [['1 portion', '1 Portion', 150]]],
  ['green_beans', 'Green beans', 'Grüne Bohnen', 31, 1.8, 7, 0.2, 2.7, 3.3, 'g', [['1 portion', '1 Portion', 150]]],
  // Grains & bread
  ['rice_white', 'White rice, cooked', 'Reis, weiß, gekocht', 130, 2.7, 28.2, 0.3, 0.4, 0.1, 'g', [['1 portion', '1 Portion', 180]]],
  ['rice_brown', 'Brown rice, cooked', 'Vollkornreis, gekocht', 123, 2.7, 25.6, 1, 1.6, 0.2, 'g', [['1 portion', '1 Portion', 180]]],
  ['pasta', 'Pasta, cooked', 'Nudeln, gekocht', 158, 5.8, 30.9, 0.9, 1.8, 0.6, 'g', [['1 portion', '1 Portion', 220]]],
  ['pasta_whole', 'Whole wheat pasta, cooked', 'Vollkornnudeln, gekocht', 149, 6, 30, 1.7, 3.9, 0.8, 'g', [['1 portion', '1 Portion', 220]]],
  ['oats', 'Rolled oats', 'Haferflocken', 372, 13.5, 58.7, 7, 10, 1, 'g', [['1 serving', '1 Portion', 40]]],
  ['bread_whole', 'Whole grain bread', 'Vollkornbrot', 210, 7, 38, 1.5, 8, 3, 'g', [['1 slice', '1 Scheibe', 50]]],
  ['toast', 'Toast bread', 'Toastbrot', 265, 9, 49, 3.2, 2.7, 5, 'g', [['1 slice', '1 Scheibe', 25]]],
  ['bread_roll', 'Bread roll', 'Brötchen', 270, 9, 53, 1.8, 2.5, 3, 'g', [['1 roll', '1 Brötchen', 55]]],
  ['pretzel', 'Soft pretzel', 'Laugenbrezel', 290, 8, 57, 2.5, 2.5, 1, 'g', [['1 piece', '1 Stück', 85]]],
  ['couscous', 'Couscous, cooked', 'Couscous, gekocht', 112, 3.8, 23.2, 0.2, 1.4, 0.1, 'g', [['1 portion', '1 Portion', 160]]],
  ['quinoa', 'Quinoa, cooked', 'Quinoa, gekocht', 120, 4.4, 21.3, 1.9, 2.8, 0.9, 'g', [['1 portion', '1 Portion', 160]]],
  ['cornflakes', 'Cornflakes', 'Cornflakes', 357, 7.5, 84, 0.4, 3.3, 9.5, 'g', [['1 bowl', '1 Schale', 30]]],
  ['muesli', 'Muesli, unsweetened', 'Müsli, ungesüßt', 360, 10, 62, 6.5, 8, 14, 'g', [['1 serving', '1 Portion', 50]]],
  ['tortilla', 'Wheat tortilla', 'Weizentortilla', 310, 8, 52, 7.5, 3, 3, 'g', [['1 piece', '1 Stück', 60]]],
  // Meat, fish, eggs, plant protein
  ['chicken_breast', 'Chicken breast, cooked', 'Hähnchenbrust, gegart', 165, 31, 0, 3.6, 0, 0, 'g', [['1 fillet', '1 Filet', 150]]],
  ['chicken_breast_raw', 'Chicken breast, raw', 'Hähnchenbrust, roh', 120, 22.5, 0, 2.6, 0, 0, 'g', [['1 fillet', '1 Filet', 180]]],
  ['ground_beef', 'Ground beef, cooked', 'Rinderhack, gebraten', 250, 26, 0, 15, 0, 0, 'g', [['1 portion', '1 Portion', 125]]],
  ['steak', 'Beef steak, cooked', 'Rindersteak, gebraten', 206, 29, 0, 9, 0, 0, 'g', [['1 steak', '1 Steak', 200]]],
  ['pork_loin', 'Pork loin, cooked', 'Schweinelende, gegart', 242, 27, 0, 14, 0, 0, 'g', [['1 portion', '1 Portion', 150]]],
  ['salmon', 'Salmon, cooked', 'Lachs, gegart', 206, 22, 0, 12.4, 0, 0, 'g', [['1 fillet', '1 Filet', 125]]],
  ['tuna_can', 'Tuna in water, canned', 'Thunfisch im eigenen Saft', 116, 25.5, 0, 0.8, 0, 0, 'g', [['1 can (drained)', '1 Dose (abgetropft)', 130]]],
  ['shrimp', 'Shrimp, cooked', 'Garnelen, gegart', 99, 24, 0.2, 0.3, 0, 0, 'g', [['1 portion', '1 Portion', 100]]],
  ['egg', 'Egg', 'Ei', 143, 12.6, 0.7, 9.5, 0, 0.4, 'g', [['1 egg', '1 Ei', 55]]],
  ['egg_white', 'Egg white', 'Eiweiß', 52, 10.9, 0.7, 0.2, 0, 0.7, 'g', [['1 egg white', '1 Eiweiß', 33]]],
  ['tofu', 'Tofu, firm', 'Tofu, natur', 144, 15.8, 2.8, 8.7, 2.3, 0.6, 'g', [['1 portion', '1 Portion', 125]]],
  ['lentils', 'Lentils, cooked', 'Linsen, gekocht', 116, 9, 20.1, 0.4, 7.9, 1.8, 'g', [['1 portion', '1 Portion', 200]]],
  ['chickpeas', 'Chickpeas, cooked', 'Kichererbsen, gekocht', 164, 8.9, 27.4, 2.6, 7.6, 4.8, 'g', [['1 portion', '1 Portion', 150]]],
  ['kidney_beans', 'Kidney beans, cooked', 'Kidneybohnen, gekocht', 127, 8.7, 22.8, 0.5, 6.4, 0.3, 'g', [['1 portion', '1 Portion', 150]]],
  ['turkey_slices', 'Turkey breast slices', 'Putenbrustaufschnitt', 104, 17.1, 4.2, 1.7, 0, 1.5, 'g', [['1 slice', '1 Scheibe', 15]]],
  ['ham', 'Cooked ham', 'Kochschinken', 107, 18, 1, 3.5, 0, 1, 'g', [['1 slice', '1 Scheibe', 20]]],
  ['salami', 'Salami', 'Salami', 380, 21, 1, 32, 0, 1, 'g', [['1 slice', '1 Scheibe', 10]]],
  // Dairy
  ['milk_35', 'Milk 3.5%', 'Vollmilch 3,5 %', 64, 3.3, 4.8, 3.5, 0, 4.8, 'ml', [['1 glass', '1 Glas', 200]]],
  ['milk_15', 'Milk 1.5%', 'Milch 1,5 %', 47, 3.4, 4.9, 1.5, 0, 4.9, 'ml', [['1 glass', '1 Glas', 200]]],
  ['yogurt', 'Plain yogurt 3.5%', 'Naturjoghurt 3,5 %', 64, 3.8, 4.7, 3.5, 0, 4.7, 'g', [['1 cup', '1 Becher', 150]]],
  ['greek_yogurt', 'Greek yogurt 10%', 'Griechischer Joghurt 10 %', 115, 3.8, 4, 10, 0, 4, 'g', [['1 serving', '1 Portion', 150]]],
  ['skyr', 'Skyr', 'Skyr', 63, 11, 4, 0.2, 0, 4, 'g', [['1 cup', '1 Becher', 150]]],
  ['quark', 'Low-fat quark', 'Magerquark', 67, 12, 4, 0.2, 0, 4, 'g', [['1 serving', '1 Portion', 125]]],
  ['cottage_cheese', 'Cottage cheese', 'Körniger Frischkäse', 98, 12, 2.6, 4.3, 0, 2.6, 'g', [['1 cup', '1 Becher', 200]]],
  ['gouda', 'Gouda', 'Gouda', 356, 24.9, 2.2, 27.4, 0, 2.2, 'g', [['1 slice', '1 Scheibe', 20]]],
  ['mozzarella', 'Mozzarella', 'Mozzarella', 254, 18, 1, 20, 0, 1, 'g', [['1 ball', '1 Kugel', 125]]],
  ['feta', 'Feta', 'Feta', 264, 14.2, 4.1, 21.3, 0, 4.1, 'g', [['1 portion', '1 Portion', 50]]],
  ['parmesan', 'Parmesan', 'Parmesan', 392, 35.8, 3.2, 25.8, 0, 0.8, 'g', [['1 tbsp grated', '1 EL gerieben', 5]]],
  ['butter', 'Butter', 'Butter', 717, 0.9, 0.1, 81, 0, 0.1, 'g', [['1 portion', '1 Portion', 10]]],
  ['cream_cheese', 'Cream cheese', 'Frischkäse', 250, 5.5, 3.5, 24, 0, 3.5, 'g', [['1 portion', '1 Portion', 20]]],
  // Fats, nuts, spreads
  ['olive_oil', 'Olive oil', 'Olivenöl', 884, 0, 0, 100, 0, 0, 'g', [['1 tbsp', '1 EL', 10]]],
  ['almonds', 'Almonds', 'Mandeln', 579, 21.2, 21.6, 49.9, 12.5, 4.4, 'g', [['1 handful', '1 Handvoll', 30]]],
  ['walnuts', 'Walnuts', 'Walnüsse', 654, 15.2, 13.7, 65.2, 6.7, 2.6, 'g', [['1 handful', '1 Handvoll', 30]]],
  ['peanuts', 'Peanuts', 'Erdnüsse', 567, 25.8, 16.1, 49.2, 8.5, 4, 'g', [['1 handful', '1 Handvoll', 30]]],
  ['peanut_butter', 'Peanut butter', 'Erdnussbutter', 588, 25, 20, 50, 6, 9, 'g', [['1 tbsp', '1 EL', 16]]],
  ['nut_spread', 'Chocolate hazelnut spread', 'Nuss-Nougat-Creme', 539, 6.3, 57.5, 30.9, 3.4, 56.3, 'g', [['1 tsp', '1 TL', 15]]],
  ['honey', 'Honey', 'Honig', 304, 0.3, 82.4, 0, 0.2, 82, 'g', [['1 tsp', '1 TL', 7]]],
  ['jam', 'Jam', 'Marmelade', 250, 0.4, 61, 0.1, 1, 55, 'g', [['1 tbsp', '1 EL', 20]]],
  ['sugar', 'Sugar', 'Zucker', 400, 0, 100, 0, 0, 100, 'g', [['1 tsp', '1 TL', 4]]],
  // Snacks & sweets
  ['dark_chocolate', 'Dark chocolate 70%', 'Zartbitterschokolade 70 %', 598, 7.8, 45.9, 42.6, 10.9, 24, 'g', [['1 row', '1 Riegel', 20]]],
  ['milk_chocolate', 'Milk chocolate', 'Vollmilchschokolade', 535, 7.7, 59.4, 29.7, 3.4, 51.5, 'g', [['1 row', '1 Riegel', 20]]],
  ['chips', 'Potato chips', 'Kartoffelchips', 536, 7, 53, 34.6, 4.4, 0.5, 'g', [['1 handful', '1 Handvoll', 30]]],
  ['gummies', 'Fruit gummies', 'Fruchtgummi', 343, 6.9, 77, 0.1, 0, 46, 'g', [['1 handful', '1 Handvoll', 25]]],
  ['ice_cream', 'Vanilla ice cream', 'Vanilleeis', 207, 3.5, 23.6, 11, 0.7, 21, 'g', [['1 scoop', '1 Kugel', 60]]],
  ['croissant', 'Croissant', 'Croissant', 406, 8.2, 45.8, 21, 2.6, 11, 'g', [['1 piece', '1 Stück', 60]]],
  // Drinks
  ['water', 'Water', 'Wasser', 0, 0, 0, 0, 0, 0, 'ml', [['1 glass', '1 Glas', 250]]],
  ['orange_juice', 'Orange juice', 'Orangensaft', 45, 0.7, 10.4, 0.2, 0.2, 8.4, 'ml', [['1 glass', '1 Glas', 200]]],
  ['cola', 'Cola', 'Cola', 42, 0, 10.6, 0, 0, 10.6, 'ml', [['1 can', '1 Dose', 330]]],
  ['beer', 'Beer', 'Bier', 43, 0.5, 3.6, 0, 0, 0, 'ml', [['1 glass', '1 Glas', 500]]],
  ['red_wine', 'Red wine', 'Rotwein', 85, 0.1, 2.6, 0, 0, 0.6, 'ml', [['1 glass', '1 Glas', 150]]],
  ['coffee', 'Coffee, black', 'Kaffee, schwarz', 2, 0.1, 0, 0, 0, 0, 'ml', [['1 cup', '1 Tasse', 200]]],
  ['cappuccino', 'Cappuccino', 'Cappuccino', 35, 2, 2.8, 1.8, 0, 2.8, 'ml', [['1 cup', '1 Tasse', 200]]],
  // Common dishes
  ['pizza_margherita', 'Pizza margherita', 'Pizza Margherita', 255, 11, 30, 10, 2, 3, 'g', [['1 slice', '1 Stück', 110], ['1 pizza', '1 Pizza', 400]]],
  ['spaghetti_bolognese', 'Spaghetti bolognese', 'Spaghetti Bolognese', 140, 7.5, 16, 5, 1.5, 2.5, 'g', [['1 plate', '1 Teller', 400]]],
  ['doner', 'Doner kebab', 'Döner', 230, 12, 22, 10, 2, 2, 'g', [['1 piece', '1 Stück', 350]]],
  ['cheeseburger', 'Cheeseburger', 'Cheeseburger', 263, 13, 26, 12, 1.5, 6, 'g', [['1 piece', '1 Stück', 120]]],
  ['fries', 'French fries', 'Pommes frites', 312, 3.4, 41, 15, 3.8, 0.3, 'g', [['1 portion', '1 Portion', 150]]],
  ['currywurst', 'Currywurst with sauce', 'Currywurst mit Soße', 220, 10, 9, 16, 0.5, 7, 'g', [['1 portion', '1 Portion', 250]]],
  ['schnitzel', 'Breaded schnitzel', 'Schnitzel, paniert', 245, 18, 12, 14, 0.5, 0.5, 'g', [['1 piece', '1 Stück', 150]]],
  ['mashed_potatoes', 'Mashed potatoes', 'Kartoffelpüree', 100, 2, 15, 3.8, 1.3, 1.5, 'g', [['1 portion', '1 Portion', 200]]],
  ['sushi_maki', 'Sushi maki', 'Sushi Maki', 145, 5, 29, 1, 1, 4, 'g', [['1 piece', '1 Stück', 25]]],
];

export function genericFoods(lang: 'de' | 'en'): Food[] {
  return ROWS.map(([id, en, de, kcal, protein, carbs, fat, fiber, sugar, unit, servings]) => ({
    id: `generic:${id}`,
    source: 'generic' as const,
    name: lang === 'de' ? de : en,
    per100: { kcal, protein, carbs, fat, fiber, sugar },
    unit,
    servings: (servings ?? []).map(([sEn, sDe, grams]) => ({ label: lang === 'de' ? sDe : sEn, grams })),
  }));
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');

/** Matches against both languages so "Apfel" and "apple" both work. */
export function searchGeneric(query: string, lang: 'de' | 'en', limit = 8): Food[] {
  const q = fold(query.trim());
  if (!q) return [];
  const foods = genericFoods(lang);
  const scored: { food: Food; score: number }[] = [];
  ROWS.forEach((row, i) => {
    const names = [fold(row[1]), fold(row[2])];
    let score = -1;
    for (const n of names) {
      if (n === q) score = Math.max(score, 3);
      else if (n.startsWith(q)) score = Math.max(score, 2);
      else if (n.split(/[\s,]+/).some((w) => w.startsWith(q))) score = Math.max(score, 1.5);
      else if (n.includes(q)) score = Math.max(score, 1);
    }
    if (score > 0) scored.push({ food: foods[i], score });
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.food);
}

export const GENERIC_FOOD_COUNT = ROWS.length;
