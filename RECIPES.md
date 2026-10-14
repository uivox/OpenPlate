# Community recipes

OpenPlate's recipe tab shows your own recipes and a shared set of community recipes. Community recipes live in [`src/lib/communityRecipes.ts`](src/lib/communityRecipes.ts) and are added through pull requests, so every recipe is visible, reviewable and free to use.

## What makes a good recipe

- **Real food you actually cook.** Everyday dishes with ingredients from a German supermarket.
- **Amounts in grams for the whole dish**, weighed or carefully estimated. Nutrition is never typed in: the app calculates it from the ingredients, so the amounts are what matter.
- **German and English** name and steps, the same number of steps in both.
- **A photo is optional.** If you add one it must be your own photo or openly licensed (for example from [Wikimedia Commons](https://commons.wikimedia.org)), linked over `https://`, with credit and licence.

## How to add one

1. Fork the repository and open `src/lib/communityRecipes.ts`.
2. Copy an existing entry and change it. The fields:

   | Field | What goes in |
   |---|---|
   | `id` | lowercase-with-dashes, unique, never changed later |
   | `name` | `{ de, en }` |
   | `servings` | how many servings the amounts make (1–20) |
   | `minutes` | total active time (optional) |
   | `tags` | any of `breakfast`, `main`, `snack`, `vegetarian`, `vegan`, `high_protein`, `quick` |
   | `ingredients` | `{ ref, grams }` for the whole dish |
   | `steps` | `{ de: [...], en: [...] }` |
   | `photo` | optional `{ url, credit, license }` |
   | `author` | your name or GitHub name |
   | `testedBy` | leave empty `[]` |

3. **Ingredient references** point at foods in the app:
   - `generic:<id>` for the built-in basics in [`src/lib/genericFoods.ts`](src/lib/genericFoods.ts) (`generic:oats`, `generic:chicken_breast_raw`, …). These have portion sizes and are the easiest choice.
   - `bls:<code>` for anything in the German nutrient database BLS 4.0 (`bls:C133000` is oat flakes). Search the code in [`src/lib/blsData.ts`](src/lib/blsData.ts) or on <https://blsdb.de>.
   - Use the state you weigh it in: raw chicken if you weigh it raw, cooked rice if you weigh it cooked.
4. Run `npm test`. A test checks every recipe: valid ids, both languages, known ingredients, grams above zero, plausible calories per serving.
5. Open a pull request with a short note on how you weighed the amounts.

## Review: "cooked and checked"

A recipe is merged once the format is right, but it only shows as **community-tested** after someone other than the author has cooked it and checked that the amounts and servings make sense. That person opens a small pull request adding their GitHub name to `testedBy`. The app shows how many people have done this; recipes with nobody yet are marked as starter recipes.

The first recipes in the file were written together with the app as a starting set. They are honest everyday dishes, but nobody has cooked them for the app yet, so they are waiting for their first testers.
