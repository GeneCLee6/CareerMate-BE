# Epic PRDs

`PRD.md` at the repository root describes the product as a whole and
version 1, which is complete. This folder holds one PRD per **version 2
epic**: the full requirements, the acceptance criteria, and the task list
that the work is actually tracked against.

| Epic | File | What it adds |
| --- | --- | --- |
| E6 | [`e6-evals.md`](e6-evals.md) | An evaluation harness and three evals that measure answer quality |
| E7 | [`e7-saved-jobs.md`](e7-saved-jobs.md) | Saving job ads, extracting their fields, tracking applications |
| E8 | [`e8-rag.md`](e8-rag.md) | Answers grounded in saved jobs: chunking, embeddings, vector search, tool use |

Epics are numbered in the order the work starts, continuing from version 1's
E1–E5 in `PRD.md`.

New epics start from [`_template.md`](_template.md).

## Order of work

Epics are not built one after another. Tasks are taken in this order, so
each one builds on something already merged:

1. **E6 `e6-t01`–`e6-t08`**: the eval harness and the `resume-review` eval.
   These need no new feature, and every later step is then measured, not
   guessed.
2. **E7 `e7-t01`–`e7-t08`**: saved jobs, backend then frontend.
3. **E8 `e8-t01`–`e8-t10`**: RAG over saved jobs.
4. **E6 `e6-t09`–`e6-t10`**: the `retrieval` and `grounded-answers` evals,
   which need E8 to exist.

## Rules

**One task, one pull request.** A task is small enough to review in one
sitting and to say "done" about on its own. If it is not, split it before
starting, not halfway through.

**The checkbox is the status.** A task is ticked in the same pull request
that completes it, never in a later one. An acceptance criterion is ticked
when every task that covers it is merged and the criterion has been
verified. These files are the only place progress is recorded; `PRD.md`
§7 only links here.

**Task line format.**

```
- [ ] <!--e7-t03--> What the task delivers · AC-E7.4, AC-E7.5 · repo: BE · learn: …
```

| Field | Meaning |
| --- | --- |
| `<!--e7-t03-->` | The task's permanent id: epic E7, task 03. New tasks are appended; a deleted task's number is never reused |
| `AC-…` | The acceptance criteria this task covers — `AC-E7.4` is epic E7's fourth — or `—` for pure groundwork |
| `repo` | `BE` for this repository, `FE` for CareerMate-FE |
| `learn` | The concepts this task teaches. The project doubles as a course; this field is the syllabus |

**Pull request titles** carry the task id, so history can be traced back to
the plan:

```
feat(jobs): [e7-t03] add status and notes updates
test(evals): [e6-t06] report grader agreement with hand labels
```

Frontend pull requests use the same ids; the PRD for both repositories
lives here.

**Open questions are asked, not guessed.** Anything undecided goes in the
epic's *Open questions* with the owner's answer written inline. An
unanswered question blocks the tasks that depend on it.

**Every task has an interview line.** When a task is merged, one sentence
goes into the epic's *Interview notes*: what was built, and the decision or
number that makes it worth mentioning.
