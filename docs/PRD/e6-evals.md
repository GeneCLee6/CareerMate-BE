---
title: E6 — Evidence of answer quality (evals)
status: in-progress
epic: E6
owner: GeneCLee6
depends_on: []   # e6-t01 to e6-t08 need nothing; e6-t09 needs e8-t05, e6-t10 needs e8-t08
---

## Background

Part of version 2 (`PRD.md` §1). Epic E6.

Every choice about the assistant so far — the model, the effort level, how
the resume reaches the prompt — was made by reading a few replies and
judging them by feel. That does not scale and cannot be defended: when a
setting changes, nothing says whether answers got better or worse. An eval
turns "this seems better" into a number that can be compared, repeated and
explained.

Evals come first in version 2 because they need no new feature. The first
eval measures the assistant as it exists today; the later two measure the
RAG features of Epic E8 as they are built.

## Goals

- A reusable harness: dataset in, per-case results and a summary table out,
  with the cost of every run recorded.
- One question answered with data: **which configuration reviews a resume
  best** — effort `medium` or `high`, the resume sent as extracted text or
  as the PDF itself — and at what cost.
- An LLM grader that is trusted only as far as it agrees with the owner's
  own hand labels.
- The same harness later measures retrieval (Epic E8) and the faithfulness
  of answers about saved jobs.

## Non-goals

- Evals do not run in CI or in `npm test`. They call paid APIs.
- No eval dashboard or UI. Results are JSON files and a console table.
- No real person's data. Every dataset is synthetic or anonymised.
- No attempt at statistical rigour beyond the basics: repeated runs to see
  variance, and enough cases for a difference to mean something.

## Requirements

### Functional

- `npm run eval:<name>` runs one eval end to end. Optional flags choose the
  configurations to compare, a case limit for quick trial runs, and the
  number of runs per case.
- Calls go through the **Message Batches API** by default: half the price
  of the same request sent live, in exchange for waiting minutes rather than
  seconds. `--sync` sends live requests instead, for small trial runs.
- Each run writes `evals/results/<name>/<timestamp>.json` holding: the git
  commit, every configuration, every case's output and scores, token usage,
  estimated cost, and latency. It prints a summary table with one row per
  configuration.
- Before calling any API, the runner estimates the run's cost and refuses
  to start above `EVAL_BUDGET_USD` (default 5), unless `--yes` is passed.
- Datasets live in `evals/datasets/<name>/` as JSON and are validated
  against a zod schema. That validation *is* part of `npm test`: it costs
  nothing and catches a malformed dataset before money is spent on it.
- The `resume-review` eval compares up to four configurations, in two
  stages:

  | Config | Effort | Resume reaches the model as |
  | --- | --- | --- |
  | `medium-text` | medium | extracted text in the system prompt (today's behaviour) |
  | `high-text` | high | extracted text in the system prompt |
  | `medium-pdf` | medium | the PDF itself, as a document block |
  | `high-pdf` | high | the PDF itself, as a document block |

  **Stage 1** runs only `medium-text` and `high-text`: is more effort worth
  it on today's input? **Stage 2** adds the PDF configurations, and runs
  only if the owner decides after stage 1 that it is worth paying for.
- Each configuration runs once per resume by default. `--runs 2` repeats
  a run when two configurations score close enough that the difference
  could be noise.
- The request under test is built by the **same code the product uses**,
  not a copy. An eval of a copy measures the copy.

### Non-functional

- Cost: the system under test stays on the product's model, Claude Opus 5,
  because that is what is being measured. The judge runs on Claude
  Sonnet 5, which costs 40% as much per token, and is trusted only after
  it passes the hand-label check (AC-E6.5); if it fails, the judge moves
  to Opus 5. With batching, stage 1 (12 resumes × 2 configurations) costs
  about US$1 and a full four-configuration run about US$2–3. The estimate
  comes from `evals/pricing.js`, which cites its source and date. The whole
  epic is expected to cost US$5–10.
- The Anthropic Console workspace running evals has a monthly spend limit,
  so a bug cannot run up an unbounded bill.
- Isolation: evals never read the production database and never need it.
- Reproducibility: model ids, effort and prompt text are written into every
  results file, so an old result can be understood without the old code.

## Design

```
evals/
├── run.js                  CLI entry: parse flags, budget check, run, report
├── harness/                shared by every eval
│   ├── runCases.js         run cases with a concurrency limit, collect results
│   ├── cost.js             tokens × price → dollars
│   └── report.js           console table + results file
├── pricing.js              per-model prices, with source URL and date
├── graders/
│   └── llmJudge.js         rubric prompt + structured output
├── resume-review/
│   ├── eval.js             configs, how one case is run, how it is scored
│   ├── generate.js         synthetic resume generator (e6-t03)
│   └── rubric.md           the judge's instructions, owned by the owner
├── datasets/resume-review/ resumes, planted issues, hand labels
└── results/                gitignored
```

**Metrics for `resume-review`.**

| Metric | Definition |
| --- | --- |
| Issue recall | Planted issues the review identified ÷ planted issues |
| Unsupported claims | Statements the review makes about the resume that the resume does not support |
| Specificity | 1–5, per the anchors in `rubric.md`: 1 = generic advice, 5 = points at exact lines and rewrites them |
| Cost | US$ per review, from the response's token usage |
| Latency | Seconds per review, median |

**The judge.** Claude Sonnet 5 at effort `high`, returning structured
output: for each
planted issue `{ id, found, evidence }`, where `evidence` quotes the part of
the review that addresses it; a list of unsupported claims; a specificity
score. It sees the resume, the list of planted issues and the review — never
which configuration produced it.

**Effort by route.** Effort trades thoroughness for tokens. The starting
points, until an eval says otherwise:

| Route | Effort | Why |
| --- | --- | --- |
| General chat | `medium` | Today's setting; conversational work rarely repays more |
| Resume review | decided by this eval | The question stage 1 answers |
| Job field extraction (E7) | `low` | The answer is already in the text |
| The eval judge | `high` | Grading must be careful; batching makes the wait irrelevant |

Thinking stays on everywhere. Lowering effort, not disabling thinking, is
how a route is made cheaper.

**Trusting the judge.** The owner labels at least 20 reviews by hand — for
each planted issue, was it found? — before looking at the judge's verdicts.
The harness reports the agreement rate. Below 80%, the rubric is revised and the judge re-checked; scores from an
unchecked judge are not reported as results.

## Acceptance criteria

- [x] **AC-E6.1** — Given an eval name, when I run `npm run eval:<name>`, then
  a results file with configurations, per-case outputs, scores, tokens, cost
  and latency is written, and a summary table is printed.
- [x] **AC-E6.2** — Given an estimated cost above `EVAL_BUDGET_USD`, when I
  start a run without `--yes`, then it stops before any API call and prints
  the estimate.
- [ ] **AC-E6.3** — Given `npm test` or CI, then no eval runs and no paid API
  is called; given a malformed dataset file, then `npm test` fails naming
  the file and field.
- [ ] **AC-E6.4** — Given at least 12 synthetic resumes, each with 2–4 planted
  issues from the owner's taxonomy, when `eval:resume-review` runs, then
  issue recall, unsupported claims, specificity, cost and latency are shown
  per configuration, for the stage-1 pair and, if run, the stage-2 pair.
- [ ] **AC-E6.5** — Given at least 20 hand-labelled reviews, when the judge
  grades them, then the agreement rate is printed next to every score, and
  a run whose judge falls below the threshold is marked as not valid.
- [ ] **AC-E6.6** — Given a completed valid run, then the chosen configuration
  and the numbers behind the choice are recorded in `ARCHITECTURE.md` §5,
  and the assistant uses that configuration.
- [ ] **AC-E6.7** — Given the retrieval dataset (at least 30 synthetic job
  ads, at least 25 questions with owner-labelled relevant jobs), when
  `eval:retrieval` runs, then recall@5, recall@8 and MRR are printed, with
  no chat-model calls.
- [ ] **AC-E6.8** — Given the grounded-answers dataset (at least 20 questions,
  at least 5 with no answer in the saved jobs), when `eval:grounded-answers`
  runs, then the share of supported claims, citation accuracy and correct
  "nothing found" rate are printed, with judge agreement as in AC-E6.5.

## Tasks

- [x] <!--e6-t01--> Harness skeleton: `evals/` layout, `run.js` CLI, concurrency-limited runner, results file, summary table, `pricing.js`, budget guard, `evals/results/` gitignored, evals excluded from jest. Message Batches submission and polling, with `--sync` for trial runs. Proven with a trivial "echo" eval that needs no API · AC-E6.1, AC-E6.2, AC-E6.3 · repo: BE · done in: BE#29 · learn: what an eval is — dataset, case, output, grader, metric; why evals are run by hand; batch vs live requests
- [ ] <!--e6-t02--> Issue taxonomy and dataset schema: the owner writes the list of resume problems worth catching (with a definition and an example each); zod schema for a resume case; schema test in `npm test` · AC-E6.3 · repo: BE · learn: defining quality before measuring it; why the taxonomy is a product decision, not a technical one
- [ ] <!--e6-t03--> Synthetic resume generator: a script that asks Claude for a resume with given planted issues and renders it to PDF; the owner reviews every generated resume and keeps at least 12 · AC-E6.4 · repo: BE · learn: synthetic data and its limits; why every generated case is read by a human
- [ ] <!--e6-t04--> Resume input mode: the product's request builder takes `resumeInput: "text" | "pdf"` (default `text`, product behaviour unchanged) and sends the PDF as a document block when asked; the eval calls this builder · AC-E6.4 · repo: BE · learn: document blocks and what the model sees in each mode; why an eval must call the real code path
- [ ] <!--e6-t05--> The judge: `rubric.md` written by the owner, `llmJudge.js` with structured output, blind to configuration, on Claude Sonnet 5; `eval:resume-review` runs stage 1 · AC-E6.4 · repo: BE · learn: LLM-as-judge, rubrics with anchored scores, structured outputs, blinding
- [ ] <!--e6-t06--> Hand labels and agreement: a small labelling script that shows one review at a time and records the owner's verdicts; agreement rate computed and printed with every result · AC-E6.5 · repo: BE · learn: validating a grader; agreement rate; why an unchecked LLM judge is not evidence
- [ ] <!--e6-t07--> Run, read, decide: a full valid run; the decision and its numbers written into `ARCHITECTURE.md` §5 · AC-E6.6 · repo: BE · learn: reading an eval table — averages, spread, cost per point of quality; when a difference is real
- [ ] <!--e6-t08--> Apply the decision: the assistant switches to the winning configuration, if it differs from today's · AC-E6.6 · repo: BE · learn: turning a measurement into a change, and saying so in the pull request
- [ ] <!--e6-t09--> `retrieval` eval: synthetic job ads, questions labelled with relevant jobs by the owner, recall@k and MRR; compares the chunking strategies from `e8-t01` · AC-E6.7 · repo: BE · learn: recall@k, MRR, why retrieval is measured separately from generation
- [ ] <!--e6-t10--> `grounded-answers` eval: claim-level faithfulness, citation accuracy, abstention; judge checked against hand labels as in `e6-t06` · AC-E6.8 · repo: BE · learn: faithfulness vs relevance, abstention as a feature

## Concepts

**Eval.** A fixed set of inputs (the *dataset*), a way to produce outputs
from each (the *system under test*), a way to score each output (the
*grader*), and a way to summarise the scores (the *metrics*). Change one
thing, run it again, compare. First met in `e6-t01`.

**Planted issues.** Instead of asking "is this review good?", which has no
fixed answer, each test resume is built with known problems. The question
becomes "did the review find them?", which does. First met in `e6-t02`.

**Synthetic data.** Test cases generated rather than collected. Cheap and
free of privacy concerns, but only as realistic as the generator — which is
why a person reads every case before it is kept. First met in `e6-t03`.

**LLM-as-judge.** A model grades another model's output against a rubric.
Fast and cheap, but a judge can be confidently wrong, so it is measured
against human labels before its scores are believed. First met in `e6-t05`.

**Grader agreement.** The share of cases where the judge and the human
reach the same verdict. It is the judge's own accuracy, and it bounds how
much any result can be trusted. First met in `e6-t06`.

**Variance.** The same configuration can score differently on two runs.
Repeating a close comparison (`--runs 2`) shows how big that spread is,
so a difference smaller than the spread is not mistaken for an
improvement. First met in
`e6-t07`.

**Recall@k and MRR.** Retrieval metrics. Recall@k: of the relevant items,
how many appear in the top k results. MRR (mean reciprocal rank): how high
the first relevant result ranks, averaged — 1 if it is always first, 0.5 if
always second. First met in `e6-t09`.

**Faithfulness.** Whether every claim in an answer is supported by the
retrieved text. An answer can be relevant and fluent and still unfaithful.
First met in `e6-t10`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Synthetic resumes are too obviously flawed, so every configuration scores 100% | The owner reviews each one; the taxonomy includes subtle issues; a first small run checks the scores are not saturated |
| The judge favours longer reviews | The rubric scores specificity against anchors, not length; hand labels catch it |
| Cost overrun | Budget guard before any call; `--limit` for trial runs; a Console spend limit |
| A cheaper judge grades badly | It must pass the hand-label check before its scores count; otherwise it moves to Opus 5 |
| Pricing changes | `pricing.js` records source and date; cost is an estimate and is labelled as one |

## Open questions

- [x] **Q:** What agreement rate must the judge reach before its scores
      count?
      **A:** 80%.
- [x] **Q:** Budget per full run?
      **A:** US$5 as the default `EVAL_BUDGET_USD`, reached by judging
      with Sonnet 5, batching every call, and running in two stages. The
      epic as a whole is budgeted at US$5–10.

## Test plan

- Harness code (runner, cost, report, agreement) has unit tests with the
  model mocked, in `npm test`.
- Dataset schemas are validated in `npm test`.
- Evals themselves are run by hand; their results files are the evidence
  and are summarised in the pull request that runs them.

## Interview notes

- `e6-t01`: built an eval harness from scratch in Node — batched requests at
  half price by default, a concurrency-limited live mode for trials, per-run
  cost estimation that refuses to send anything over budget, and results
  files that record the commit, every output and every score.
