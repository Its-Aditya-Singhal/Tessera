# Handoff-fidelity benchmark

Measures how much of a conversation survives a chat handoff (build prompt, section 9, item 2).
Each synthetic conversation has planted facts, decisions (some changed mid-conversation) and code.
The target model gets the conversation in one of four forms and answers follow-up questions that
need the earlier context:

| Condition | What the target model sees                                                                        |
| --------- | ------------------------------------------------------------------------------------------------- |
| `full`    | The whole transcript                                                                              |
| `hybrid`  | The capsule from the M7 capsule builder (goal, decisions, facts, last N turns, all code verbatim) |
| `summary` | A plain prose summary written by the summarizer model (chunked map-reduce for long chats)         |
| `none`    | Only the question                                                                                 |

## Run it

From the repository root:

```sh
pnpm eval:handoff              # uses packages/eval/handoff/handoff.config.json (local Ollama by default)
pnpm eval:handoff --fake       # deterministic fake models: checks the harness, produces no results
pnpm eval:handoff --conditions full,none --limit 5
```

The TypeScript sources run directly with Node's type stripping (Node 22.18 or newer), so there is
no build step.
Results go to `results/handoff-results.json` (every answer, score and token count) and
`results/handoff-results.md` (the summary table). Model responses are cached in
`results/.cache.jsonl`, so an interrupted run resumes where it stopped. `--fake` output goes to
`results/fake/`, is git-ignored, and is stamped as a harness test.

## Configuration

`handoff/handoff.config.json`:

- `target`: the model that answers the questions. Providers: `ollama` (`model`, `baseUrl`,
  `numCtx`), `openai-compatible` (any local server such as llama.cpp, LM Studio or vLLM; `baseUrl`
  includes `/v1`; `apiKeyEnv` names an environment variable for a free-tier hosted endpoint, never
  the key itself), and `fake` (tests only). Temperature defaults to 0.
- `summarizer`: writes the plain-summary baseline. Defaults to the target.
- `judge`: optional. When set, a fact or decision answer that fails the strict check is shown to the
  judge with the expected answer, and a "Recall (judged)" column is added. Strict scores are always
  reported.
- `capsule.module`: a module exporting a `CapsuleBuilder` (see `src/capsule.ts`) as `capsuleBuilder`
  or default, relative to the config file. `null` until M7 lands, and the hybrid row then reads
  "not run". `capsule.lastTurns` is passed through as N.
- `summary.maxWords`, `summary.chunkTokens`, `bootstrap`, `dataset`, `outDir`.

## Dataset

`data/conversations.json` holds 40 conversations (10 domains × 4 variants, 18-44 messages,
about 390-1,100 tokens each) with 260 questions: 158 facts, 54 decisions (45 of them revised
mid-conversation) and 48 code blocks. Planted values (ports, codes, prices, identifiers, constants
inside code) come from a seeded RNG, so a model cannot answer them from general knowledge.

It is generated, not hand-edited: change `src/dataset/domains.ts`, then
`pnpm --filter @tessera/eval-handoff dataset`.
A test fails if the committed file drifts from the generator, and other tests check that every
answer is present in the transcript at the message recorded for it, that revisions come after the
original choice, and that no question leaks its answer.

All content is synthetic. Names, codes and numbers are random and do not refer to real people,
accounts or bookings.

## Scoring

- **Facts:** the answer contains a planted value, with number and word boundaries respected
  (13 does not match 130) and thousands separators ignored.
- **Decisions:** every content word of the final choice appears in the answer. An answer that names
  only the superseded choice counts as **stale**, reported separately.
- **Code:** a code block in the answer equals the planted block, ignoring line endings and trailing
  spaces (`codeExact`). `codeLoose` ignores all whitespace, to tell reformatting apart from lost code.
- **Context carries answer:** model-free check of whether the handoff context itself still holds
  what each question needs. It separates losses in the context from losses in the model.
- **Token cost:** approximate context tokens per conversation (`src/tokens.ts`, same counter for every
  condition), generation tokens spent building the context (summarizer calls), and the prompt tokens
  the model server reports, when it reports them.

Rates come with 95% percentile bootstrap intervals, resampling whole conversations.

## Known limitations

- Conversations are short compared to real long chats, so the full transcript always fits a small
  model's context. This favours `full` and understates the value of trimming. Longer variants are a
  template change away.
- Strict matching penalises paraphrase ("prorating by the hour" for "prorate to the hour"); configure
  a judge to measure that gap.
- Decisions have two or three options, so `none` can guess some decisions correctly by chance.
