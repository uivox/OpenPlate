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

Macro colours are the same everywhere (ring, bars, AI results) so people learn them once. Meals each get a soft tile colour: breakfast corn, lunch avocado, dinner plum, snacks beet.

### Themes and own colours

The palette above is the default theme, **Garden**. *Profile → Appearance* offers six more (Ocean, Berry, Sunset, Forest, Mono, Neon), each with a light and a dark version, plus a forced light/dark switch. Users can also pick their own **button colour** and **macro colours** (swatches or any hex code).

All of it is built in `src/lib/themes.ts`:

- Each theme defines the ground (`bg`, `card`, `cardAlt`), ink (`text`, `sub`, `line`) and action colour; produce colours are shared unless a theme overrides them (Neon does).
- Text on an accent is picked by contrast; `accentSoft` and meal tiles are mixed from the accent/produce colour and the card. Garden keeps its hand-picked values exactly.
- Own colours are nudged lighter/darker until they stand out from the background (`ensureContrast`), so a dark accent on a dark theme can't disappear.
- A test checks every theme in both schemes: text ≥ 7:1 on bg and card, secondary text ≥ 3.5:1, text on accent ≥ 4.5:1, meal icons readable on their tiles.

Screens never hard-code colours; they read `useColors()`, which follows the chosen theme, scheme and own colours.

## Type

- **Bricolage Grotesque** (SemiBold, ExtraBold): big numbers, screen titles, the greeting. Its slightly irregular shapes give the warmth.
- **Figtree** (Regular → Bold): everything else, tuned for small sizes.
- **Space Grotesk** replaces Bricolage for numbers and titles in the Neon theme (`c.fontDisplay`, `c.fontDisplayHeavy`); `<Txt>` picks it up automatically.

No all-caps labels. Numbers that tick (fasting timer) use tabular figures. Weights are separate font families, never `fontWeight`, so Android renders them correctly.

## Shape and space

- Radius follows hierarchy: plate and timer cards 36, meal cards 28, fields 12, chips and buttons fully round.
- No drop shadows except the floating tab bar, which has to sit above content. The one exception is the Neon theme's glow: cards get a faint accent outline and soft accent shadow, the plate rim a wider translucent copy underneath, primary buttons and the add button a coloured shadow.
- The add button in the tab bar picks the meal by time of day. *Profile → Layout* lets people reorder or hide tabs (Diary and Profile always stay), put the add button left, centre or right, and reorder or hide diary sections (plate and meals always stay).

## Character

A small beet-coloured bowl with a sprout appears on the welcome screen, in empty states, on the profile card (happy), in the fasting timer while you rest (sleepy) and in the AI photo flow (surprised). It never talks and never blocks anything.

## Motion

A setting in *Profile → Appearance*, default **Lively**. The system's Reduce Motion switch always wins and turns everything off. All of it lives in `src/components/motion.tsx` and reads `useMotion()`.

- **Lively**: buttons, chips and icons spring when pressed, with a ripple spreading from the finger and a light haptic tick; tab screens shift in and the active tab icon springs up on a soft pill; cards on tab screens glide in one after another (`<Screen appear>`); the kcal numbers count up; the plate sends out one soft pulse when food is added; streak milestones get a small burst of dots.
- **Calm**: the original single moment, the plate rim easing into place; buttons shrink slightly on press.
- **Off**: nothing moves.

Haptics confirm adds in every mode.
