# Evals

An eval measures answer quality: a fixed **dataset** of cases, a **system under
test** that produces an output for each, a **grader** that scores each output,
and **metrics** that summarise the scores. Change one thing, run it again,
compare. The plan and acceptance criteria are in
[`docs/PRD/e6-evals.md`](../docs/PRD/e6-evals.md).

Evals call paid APIs, so they are **run by hand** and are never part of
`npm test` or CI. The harness itself is unit-tested there, with the model
mocked.

## Running one

```bash
npm run eval:echo                          # the free demonstration eval
npm run eval -- <name> --limit 2 --sync    # a cheap trial of a real one
npm run eval -- <name>                     # a full run, batched
```

| Option | Meaning |
| --- | --- |
| `--configs a,b` | Run only these configurations |
| `--limit N` | Run only the first N cases — for trial runs that cost cents |
| `--runs N` | Repeat each case N times, to see how much results vary |
| `--sync` | Send requests live: full price, results in seconds |
| *(default)* | Send through the Message Batches API: half price, results in minutes |
| `--yes` | Run even when the estimate is over the budget |
| `--concurrency N` | Live requests in flight at once (default 4) |

Before sending anything, the runner estimates the cost and stops if it is
over `EVAL_BUDGET_USD` (default US$5). The key comes from
`ANTHROPIC_API_KEY` in `.env`; a local eval like `echo` needs none.

Each run prints a table — one row per configuration — and writes everything
to `evals/results/<name>/<timestamp>.json` (gitignored): the commit, the
configurations, every output and score, tokens and estimated cost.

## The resume-review dataset

Test resumes are generated, then read by a person before they are used.

```bash
npm run eval:generate-resumes                 # every case in plan.js not yet on disk
npm run eval:generate-resumes -- --only r03   # one case, e.g. after rejecting it
npm run eval:review-resumes                   # approve or reject each unreviewed case
```

`resume-review/plan.js` fixes who each applicant is and which problems from
`taxonomy.js` are planted in their resume. The generator asks Claude Sonnet 5
for the resume as structured output, checks that the planted problems match
the plan and that every quoted piece of evidence really is in the resume,
renders a PDF next to the JSON, and saves the case as unreviewed. The review
tool shows each one with its planted problems; approving stamps the reviewer
and date, and only approved cases are used in runs.

A generated resume can still contain a problem that was not planned. Recall
is measured on the planted problems only, so this does not skew it, but a
reviewer should reject a case where an unplanned problem is glaring.

## Layout

```
evals/
├── run.js              CLI: parse options, run, exit non-zero if stopped
├── pricing.js          per-model prices, with source and date
├── harness/            shared by every eval
│   ├── runEval.js      estimate → budget check → run → score → report
│   ├── runCases.js     live runs with a concurrency limit
│   ├── batch.js        Message Batches: submit, poll, match by custom_id
│   ├── cost.js         tokens × price
│   ├── budget.js       the spend guard
│   └── report.js       summary table and results file
├── resume-review/     the first real eval
│   ├── taxonomy.js     the resume problems it checks for
│   ├── schema.js       what a test case must look like
│   ├── dataset.js      loads and validates the cases
│   ├── plan.js         which resumes to generate, with which problems
│   ├── generate.js     generates them (structured output) and renders PDFs
│   ├── render.js       plain text to PDF
│   └── review.js       the owner's review, one case at a time
├── <name>/eval.js      one eval
└── datasets/<name>/    its cases
```

## Writing an eval

An eval module exports `loadCases()`, `configs`, and `score(case, output,
config)`, plus either `run(case, config)` for an output computed locally, or,
for an output from the model, `request(case, config)` (API parameters),
`parse(message, case, config)` and `estimate(case, config)` (a rough token
count for the budget check). `echo/eval.js` is the smallest example.
