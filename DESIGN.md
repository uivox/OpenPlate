# OpenPlate design

**Idea:** a veggie patch, not a gym. Logging food should feel like jotting in a kitchen notebook: warm, a bit playful, never judgemental. The memorable element is the **plate**: the daily calorie ring is drawn as a plate seen from above, and its rim fills with one colour per macro. Everything around it stays quiet.

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| Pistachio | `#EEF2E5` | `#17121B` | background |
| Aubergine | `#2A1E33` | `#F4EEF6` | text, selected chips |
| Beet | `#9C2F62` | `#E26A9E` | actions: buttons, add button, links |
| Corn | `#E39B12` | `#F2B947` | carbohydrates, breakfast |
| Blueberry | `#4A5BD4` | `#8592F2` | protein |
| Avocado | `#5E9A3B` | `#8CC46A` | fat, the sprout, steps |
| Tomato | `#E2492F` | `#F2694F` | over budget |
| Night | `#2F2B6E` | `#2A2754` | the fasting timer card |

Macro colours are fixed everywhere (ring, bars, AI results) so people learn them once. Meals each get a soft tile colour: breakfast corn, lunch avocado, dinner plum, snacks beet.

## Type

- **Bricolage Grotesque** (SemiBold, ExtraBold): big numbers, screen titles, the greeting. Its slightly irregular shapes give the warmth.
- **Figtree** (Regular → Bold): everything else, tuned for small sizes.

No all-caps labels. Numbers that tick (fasting timer) use tabular figures. Weights are separate font families, never `fontWeight`, so Android renders them correctly.

## Shape and space

- Radius follows hierarchy: plate and timer cards 36, meal cards 28, fields 12, chips and buttons fully round.
- No drop shadows except the floating tab bar, which has to sit above content.
- Centre add button in the tab bar picks the meal by time of day.

## Character

A small beet-coloured bowl with a sprout appears on the welcome screen, in empty states, on the profile card (happy), in the fasting timer while you rest (sleepy) and in the AI photo flow (surprised). It never talks and never blocks anything.

## Motion

One moment only: the plate rim eases into place when the diary opens or food is added. Skipped when Reduce Motion is on. Buttons scale slightly on press; haptics confirm adds.
