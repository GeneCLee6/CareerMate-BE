# Epic PRDs

One PRD per epic: its requirements, its acceptance criteria, and the task
list the work is tracked against. `PRD.md` at the repository root holds
what applies to every epic and links here.

| Epic | File | What it covers | Status |
| --- | --- | --- | --- |
| E0 | [`e0-foundation.md`](e0-foundation.md) | Server skeleton, error contract, hardening, CI, deployment, legal pages | Live |
| E1 | [`e1-registration.md`](e1-registration.md) | Sign-up and email verification | Done |
| E2 | [`e2-sign-in.md`](e2-sign-in.md) | Sign-in, sessions, password recovery | Done |
| E3 | [`e3-profile.md`](e3-profile.md) | Profile, onboarding, settings | Done |
| E4 | [`e4-resumes.md`](e4-resumes.md) | Resume upload, text extraction, download | Done |
| E5 | [`e5-ai-conversation.md`](e5-ai-conversation.md) | The assistant: chat, attachments, dictation, history | Done |
| E6 | [`e6-evals.md`](e6-evals.md) | An evaluation harness and three evals that measure answer quality | Next |
| E7 | [`e7-saved-jobs.md`](e7-saved-jobs.md) | Saving job ads, extracting their fields, tracking applications | Planned |
| E8 | [`e8-rag.md`](e8-rag.md) | Answers grounded in saved jobs: chunking, embeddings, vector search, tool use | Planned |

E0–E5 are version 1 and were written up after the fact: every ticked task
names the pull request or commit that delivered it, so the history can be
checked. E6–E8 are version 2 and are planned ahead.

Epics are numbered in the order the work starts. E0 is the foundation
underneath all of them.

New epics start from [`_template.md`](_template.md).

## Order of work

Version 1's open tasks (`e0-t14`, `e1-t07`, `e5-t08`) are taken when
needed. Version 2 is not built one epic after another; tasks are taken in
this order, so each one builds on something already merged:

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
§3 only links here.

**Task line format.**

```
- [ ] <!--e7-t03--> What the task delivers · AC-E7.4, AC-E7.5 · repo: BE · learn: …
- [x] <!--e4-t03--> What the task delivered · AC-E4.5 · repo: BE · done in: BE#14 · learn: …
```

| Field | Meaning |
| --- | --- |
| `<!--e7-t03-->` | The task's permanent id: epic E7, task 03. New tasks are appended; a deleted task's number is never reused |
| `AC-…` | The acceptance criteria this task covers — `AC-E7.4` is epic E7's fourth — or `—` for pure groundwork |
| `repo` | `BE` for this repository, `FE` for CareerMate-FE |
| `done in` | Once ticked: the pull request (`BE#14`, `FE#23`) or, for work before pull requests were used, the commit |
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
