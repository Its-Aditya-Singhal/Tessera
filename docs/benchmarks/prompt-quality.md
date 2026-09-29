# Prompt-quality benchmark

Does rewriting a prompt with Tessera's optimizer make the chatbot's answer better? This page
describes how we measure that and holds the published results. The harness is in
[`packages/eval/prompts`](../../packages/eval/prompts/README.md); run it with `pnpm eval:prompts`.

## Results

**No results yet.** The optimizer exists (M4) and the harness can run it
(`"optimizer": { "kind": "tessera", ... }`), but a run needs a local target, judge and optimizer
model, and none was reachable from the environment that built this release. The harness has been
tested end to end with fake models only, and fake-model output is never published. This table
stays empty until a real run replaces it.

The gate's decisions, which need no model, are published in [gate.md](gate.md).

| Group | Items | Rewritten | Win | Tie | Loss | Net (pp) | Checks: orig → opt pass |
| ----- | ----: | --------: | --- | --- | ---- | -------- | ----------------------- |
|       |       |           |     |     |      |          |                         |

When a run is published here, it will state the target model, judge model, optimizer version,
dataset hash and date, and link the full `results.json`.

## Method

### Dataset

176 prompts written for this benchmark (no real user data):

| Category    |  en |  ta |  hi | hinglish | Total |
| ----------- | --: | --: | --: | -------: | ----: |
| coding      |  30 |   2 |   2 |        3 |    37 |
| writing     |  26 |   4 |   4 |        4 |    38 |
| summarizing |  22 |   3 |   3 |        3 |    31 |
| reasoning   |  30 |   5 |   5 |        4 |    44 |
| format      |  20 |   2 |   2 |        2 |    26 |

Each prompt is also tagged by how well-specified it already is: 54 `vague` (what people actually
type, like "regex for email"), 71 `typical`, 51 `well-specified`. 149 prompts have a checkable
answer: a number (math and word problems, answers computed by the generator), a required format
(JSON keys, bullet count, word limit, exact line pattern), required content, or the expected
script (Tamil, Devanagari, or Roman for Hinglish).

### Procedure

For each prompt:

1. The optimizer returns `improve`, `ok_as_is` or `ask`. Only `improve` with changed text counts
   as rewritten. The others are left alone: in the product the user would send the original, so
   there is nothing to compare.
2. A fixed **target model** answers the original and the optimized prompt with identical settings
   (temperature 0, fixed seed, same token cap).
3. A **judge model** compares the two answers against the **original** prompt, because that is
   what the user actually wanted. An optimizer that adds requirements the user never asked for
   should not get credit for them.
4. Each pair is judged **twice, with the answers in swapped positions**. The two votes are summed
   (+1 for optimized, -1 for original, 0 for tie per vote): a positive total is a win, negative a
   loss, zero a tie. A judge that always picks the first slot therefore scores a tie, not a win.
5. If the prompt has a check, both answers are checked. Optimized passes and original fails is a
   win; the reverse is a loss; otherwise a tie.

### Length control

Judges, especially small ones, tend to prefer longer answers, and a more detailed prompt usually
produces a longer answer. So a "win" can be a length artefact. We control for it in four ways:

- Both answers get the same token cap.
- The judge prompt explicitly says length and unrequested detail are not a plus.
- The report shows the correlation between the answer length ratio and the judge's score, and the
  win/loss rates restricted to **length-matched pairs** (answers within ×1.25 of each other).
- A **length-controlled net preference**: the per-item judge score is regressed on
  ln(optimized length / original length), and the intercept (the expected preference at equal
  length) is reported with a bootstrap CI. If the raw net win is positive but this intercept is
  near zero, the optimizer is mostly making answers longer.

### Statistics

Win, tie and loss rates, and net (win minus loss), are reported overall and split by category,
language and prompt style, each with a 95% percentile bootstrap confidence interval (10,000
resamples over items, fixed seed, so a results file always reproduces the same intervals). With
around 30 items in a group the intervals are wide, roughly ±15-20 points, so per-language results
are indicative, not conclusive.

We report two views:

- **Rewritten only**: the effect of a rewrite when one happens.
- **End to end**: all items, with left-alone prompts counted as ties. This is what a user
  experiences, and it rewards a gate that only rewrites when it helps.

### Negative results

Every item where optimizing lost, by the judge or by a check, is listed in the report with its
category, language and style. These are published, not hidden, and they are the input for tuning
the gate in M6: if `well-specified` prompts mostly lose when rewritten, the gate should leave them
alone.

### Judge health

The report shows position consistency (how often both orderings agree) and how many votes could
not be parsed after one retry (those count as abstentions). A low consistency rate means the
judge is too weak for the task and the pairwise numbers should not be trusted; the checkable-task
results do not depend on the judge.

## Threats to validity

- **One target model.** Results for a 1.5B model need not transfer to the large models behind the
  chat sites, where a vague prompt costs less. A run against a second, larger target is the
  obvious follow-up.
- **LLM judge.** Even with position swapping and length control, a local judge is noisy and may be
  weaker in Tamil and Hindi than in English. The checkable tasks are the judge-free anchor.
- **Author bias.** The prompts were written by the same project that builds the optimizer. The
  dataset and its generator are public so anyone can inspect or extend them.
- **Answer extraction.** Numeric checks take the number after an "Answer:" marker (in English,
  Hindi or Tamil), a bolded or boxed number, or else the last number. Parsing mistakes affect both
  sides equally but add noise.
