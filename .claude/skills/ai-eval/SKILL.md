---
name: ai-eval
description: Evaluate OpenPlate's AI answers from an exported AI answer log (openplate-ai-log-*.json) and propose prompt or model changes. Use when the user says "run the AI eval", "evaluate the AI log", or drops an AI log export into eval/inbox/.
---

# Evaluating the AI answer log

The app can keep a log of every AI answer (meal photo and nutrition label), the photos the AI
saw, what the user saved and an optional rating (AI settings → *AI answer log*). This skill turns
an export of that log into a verdict on the current prompts and models, and concrete changes.

The data is the user's own meals and photos. It stays in `eval/` (git-ignored). Never commit it,
never paste photos or notes into a pull request, issue or commit message.

## 1. Unpack

1. Look for exports in `eval/inbox/` (`openplate-ai-log-*.json`). If there are none, ask the user
   to export the log in the app (AI settings → AI answer log → Export log → Share) and put the
   file there.
2. Run `node scripts/ai-log-unpack.mjs` (reads every export in `eval/inbox/`, merges by record
   id with what is already in `eval/data/`, newest export wins).
3. Read `eval/data/summary.md`: numbers per kind (meal / label), prompt version and model, the
   worst cases, failures, and every note or problem tag the user left.

## 2. Know what the numbers mean

- **Meal photos:** on the review screen the user can only change an item's grams and name, or
  untick it. The kcal per 100 g always comes from the AI. So:
  - the kcal error is portion size plus removed items; wrong energy density shows up only as the
    `values_off` tag or a note;
  - grams from records with `rating.weighed: true` are ground truth; other grams are the user's
    own estimate and can be wrong too;
  - `diaryNow` is what the diary says at export time: a later grams change or a deleted entry is
    the user's most honest correction and counts over `outcome`.
- **Labels:** the label photo is the truth. `ai.per100` is what the AI read, `outcome.per100` what
  the user saved after checking. The form rounds AI values to one decimal (kcal to whole numbers),
  so smaller differences are rounding, not corrections.
- `attempts` lists every provider call with its raw reply (`raw`), duration and error, including
  the fallback. `answeredBy` is the answer the user saw.
- `status`: `saved`, `not_saved` (left, retried or took a new photo) or `failed` (no usable answer).
- Fewer than ~30 saved cases for a group: say the numbers are a first impression, not a result.

## 3. Look at the cases

Open the photos (`eval/data/cases/<id>/photo-0.jpg`, Read shows images) for:

- the worst 10 meals and the most corrected labels from the summary;
- every case with a note or a problem tag;
- a handful of random `spot_on` / uncorrected cases, to check that "no correction" really means right;
- failures whose `raw` reply is present (parsing or plausibility problems, not network errors).

For each, decide who was right (AI / user / unclear) and the error type, for example:
portion too small or too large, wrong dish, missed item, invented item, wrong energy density
(oil, sauce, dressing, cheese), drink volume, label digit misread, per-serving column taken for
per-100 g, kJ taken for kcal, name or brand wrong, JSON or parsing failure.

## 4. Report

Write `eval/reports/<YYYY-MM-DD>.md` (git-ignored) and give the user a short version in chat:

1. Data: date range, number of cases per kind / prompt version / model, how many weighed.
2. Headline numbers from the summary, with the caveats from step 2.
3. Error patterns, most costly first (in kcal for meals), each with 2–3 example case ids.
4. Proposed changes, each tied to a pattern:
   - prompt edits as concrete diffs to `buildMealPrompt` in `src/lib/ai.ts` or
     `buildLabelPrompt` in `src/lib/labelScan.ts`;
   - model or provider changes (e.g. a cheaper model for labels if label accuracy is already
     high), with the cost and speed trade-off;
   - app changes if the data cannot answer a question (for example a missing correction path).
5. What to measure next time to confirm the change.

## 5. If the user wants to apply a change

- Follow CLAUDE.md (own branch, pull request, `npm run check && npm test`).
- Bump the matching entry in `PROMPT_VERSION` (`src/lib/aiLog.ts`) whenever a prompt text
  changes, so the next evaluation can compare before and after.
- Keep the prompt's JSON shape unless `parseMealJson` / `parseLabelJson` and their tests change too.
- Optional replay: re-running logged photos against a new prompt or model costs API money and
  needs the user's API key. Only do it when the user asks, say roughly what it will cost first,
  and never put the key in a file in the repo.
