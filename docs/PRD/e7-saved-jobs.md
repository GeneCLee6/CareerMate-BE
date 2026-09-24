---
title: E7 — Saved jobs
status: ready
epic: E7
owner: GeneCLee6
depends_on: [e6-t08]   # built after the first eval, so extraction (e7-t04) can be measured the same way
---

## Background

Part of version 2 (`PRD.md` §1). Epic E7.

Today the assistant knows the user's resume but nothing about the jobs they
are applying for, so every conversation about a specific role starts with
the user pasting the ad again. Saved jobs give the assistant a lasting
picture of what the user is aiming at, and give the user one place to keep
track of their applications.

This epic is also the data that Epic E8 searches. Its design — especially
the extracted fields and the delete behaviour — is shaped by that.

## Goals

- A user can save a job ad by pasting it, and find it again later.
- Every saved job has structured fields — title, company, location, work
  type, seniority, skills — without the user typing them.
- The saved-jobs list works as an application tracker.
- The data model is ready for Epic E8: chunks can be attached to a job and
  are removed with it.

## Non-goals

- No importing from job boards, by URL or otherwise. Their terms forbid
  scraping, and most ad pages need a signed-in browser to render.
- No automatic applications, reminders or email notifications.
- No sharing saved jobs between users.
- No Kanban drag-and-drop board. A list filtered by status covers the need.

## Requirements

### Functional

| Endpoint | Purpose |
| --- | --- |
| `POST /v1/jobs` | Save a job. Body: `description` (required), `title`, `company`, `url` (optional) |
| `GET /v1/jobs` | List the user's jobs, newest first, without the full description. Optional `?status=` filter |
| `GET /v1/jobs/:id` | One job, with description and extracted fields |
| `PATCH /v1/jobs/:id` | Update `status` and/or `notes` |
| `DELETE /v1/jobs/:id` | Delete the job and everything attached to it |
| `POST /v1/jobs/:id/extract` | Retry field extraction for a job whose extraction failed |

**Stored fields.**

| Field | Source | Notes |
| --- | --- | --- |
| `description` | user | 200–20,000 characters, stored as pasted |
| `title`, `company` | user, else extracted | What the user typed always wins |
| `url` | user | Optional; must be an `http(s)` URL; stored, never fetched |
| `location`, `workType`, `seniority` | extracted | `workType`: `onsite` / `hybrid` / `remote` / `unknown`. `seniority`: `intern` / `graduate` / `junior` / `mid` / `senior` / `unknown` |
| `requiredSkills`, `niceToHaveSkills` | extracted | Arrays of short skill names, as written in the ad |
| `status` | user | `saved` (default) / `applied` / `interviewing` / `offer` / `rejected` |
| `notes` | user | Private, at most 2,000 characters |
| `extractionStatus` | system | `pending` / `ok` / `failed` |
| `indexStatus` | system | Reserved for Epic E8: `pending` / `ok` / `failed` |

**Extraction.** On save, the job is stored first with
`extractionStatus: "pending"`, then the model is asked for the fields above
with structured output, and the job is updated. A failed extraction leaves
the job saved with `extractionStatus: "failed"`; the retry endpoint runs it
again.

**Frontend.** A *Saved jobs* page reachable from the main navigation:

- A form to paste an ad, with optional title, company and URL.
- A list showing title, company, status and the date saved, filterable by
  status.
- A detail view showing the ad, the extracted fields, status and notes, with
  a delete action that asks for confirmation.
- An empty state that explains what saving a job is for.

### Non-functional

- Isolation: every query is scoped to `req.user.id`. Another user's job id
  answers 404, never 403.
- Ad text is untrusted input. Where it reaches a prompt it is fenced and
  labelled as data, as resume text already is (`ARCHITECTURE.md` §5).
- Limits: 200 saved jobs per user; extraction is not retried automatically,
  so a failing ad cannot loop on a paid API.
- Tests never call a paid API; extraction is tested with the model mocked.

## Design

- `src/jobs/` follows the layout of `src/resumes/`: `job.model.js`,
  `job.validation.js` (zod), `job.controller.js`, `job.routes.js`,
  `jobExtraction.js`.
- Indexes: `{ user: 1, createdAt: -1 }` for the list, `{ user: 1, status: 1 }`
  for the filter.
- Extraction reuses the Anthropic client from `src/chat/claude.service.js`
  at effort `low` (see `e6-evals.md`, Effort by route), and asks for a JSON
  schema through structured outputs, so the reply is
  valid JSON by construction rather than parsed out of prose.
- Delete removes the job's chunks (Epic E8) in the same request. Until Epic E8
  exists there is nothing to remove, but the hook is in place from `e7-t03`.
- Frontend: `src/pages/Jobs/` with `src/api/jobs.ts`, following the patterns
  of the resume panel and settings pages.

## Acceptance criteria

- [ ] **AC-E7.1** — Given ad text of 200–20,000 characters, when I save it,
  then it appears first in my list with status `saved`.
- [ ] **AC-E7.2** — Given text shorter than 200 or longer than 20,000
  characters, or a URL that is not `http(s)`, then I get 400 naming the
  field and the limit.
- [ ] **AC-E7.3** — Given I already have 200 saved jobs, when I save another,
  then I get 400 telling me to delete some first.
- [ ] **AC-E7.4** — Given saved jobs, when I list them, then I get them newest
  first without full descriptions; given `?status=applied`, then only
  applied ones.
- [ ] **AC-E7.5** — Given a saved job, when I set its status or notes, then the
  change is stored; given a status outside the allowed set or notes over
  2,000 characters, then I get 400.
- [ ] **AC-E7.6** — Given another user's job id, when I read, update, delete
  or re-extract it, then I get 404.
- [ ] **AC-E7.7** — Given a job of mine, when I delete it, then the job and
  everything attached to it are removed.
- [ ] **AC-E7.8** — Given a saved ad, when extraction succeeds, then location,
  work type, seniority and both skill lists are filled in, and a title or
  company I typed is kept over the extracted one.
- [ ] **AC-E7.9** — Given extraction fails, then the job is still saved with
  `extractionStatus: "failed"`; when I retry and it succeeds, then the
  fields are filled in and the status is `ok`.
- [ ] **AC-E7.10** — Given the Saved jobs page, when I paste an ad and save,
  then it appears in the list without a reload; given no saved jobs, then
  the empty state explains what the page is for.
- [ ] **AC-E7.11** — Given a job in the list, when I open it, then I see the ad,
  the extracted fields, status and notes, and can change status, edit notes
  and delete after confirming.

## Tasks

- [ ] <!--e7-t01--> Job model and validation: Mongoose schema with the fields and indexes above, zod schemas for create and update, unit tests for the validation rules · AC-E7.2, AC-E7.5 · repo: BE · learn: designing a schema for the queries you will run; why indexes follow the list and filter queries
- [ ] <!--e7-t02--> Create, list and read: `POST /jobs`, `GET /jobs`, `GET /jobs/:id`, the 200-job limit, route tests · AC-E7.1, AC-E7.2, AC-E7.3, AC-E7.4 · repo: BE · learn: projection (not sending the full description in a list); enforcing a per-user limit
- [ ] <!--e7-t03--> Update and delete: `PATCH` and `DELETE`, the delete hook for attached data, isolation tests for every route · AC-E7.5, AC-E7.6, AC-E7.7 · repo: BE · learn: 404 vs 403 and why it matters; testing access control on purpose
- [ ] <!--e7-t04--> Structured extraction on save: `jobExtraction.js` with a JSON schema through structured outputs, the ad fenced as data, user-typed values winning, failures leaving the job saved; tests with the model mocked · AC-E7.8, AC-E7.9 · repo: BE · learn: structured outputs; designing an extraction schema; prompt injection through pasted text
- [ ] <!--e7-t05--> Retry endpoint and backfill script: `POST /jobs/:id/extract`, and `scripts/extract-pending-jobs.js` with `--dry-run` for jobs left `pending` or `failed` · AC-E7.9 · repo: BE · learn: making a failure recoverable; idempotent scripts
- [ ] <!--e7-t06--> Frontend API client and Saved jobs page: `src/api/jobs.ts` with types, the paste form, the list with status filter, the empty state, navigation entry · AC-E7.10 · repo: FE · learn: typing an API response once and reusing it; optimistic vs confirmed list updates
- [ ] <!--e7-t07--> Frontend job detail: the ad, extracted fields, status control, notes editor, delete with confirmation, a retry button when extraction failed · AC-E7.11 · repo: FE · learn: editing server state from a form; confirmation for destructive actions
- [ ] <!--e7-t08--> Extraction check: a small `extraction` eval on 20 synthetic ads with known fields, reporting per-field accuracy, using the harness from Epic E6 · AC-E7.8 · repo: BE · learn: evaluating extraction, which has exact answers, unlike review quality

## Concepts

**Structured outputs.** Instead of asking for JSON and hoping, the request
includes a JSON schema and the model's reply is constrained to match it.
The code receives valid, typed data or an error — never half-formed JSON
inside a sentence. First met in `e7-t04`.

**Extraction vs generation.** Extraction pulls facts that are already in
the text; generation writes something new. Extraction has right answers, so
it can be scored exactly, field by field. First met in `e7-t08`.

**Prompt injection through data.** A pasted ad can contain text such as
"ignore your instructions". Fencing it in labelled tags and telling the
model it is data keeps it from being read as instructions. The same
defence already protects resume text. First met in `e7-t04`.

**Projection.** Returning only the fields a screen needs. A list of 200
jobs with full descriptions is megabytes; without them it is kilobytes.
First met in `e7-t02`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Ads pasted with navigation, cookie banners and other page noise | Extraction is told to ignore it; the 20,000-character cap bounds the worst case |
| Extraction invents a skill the ad does not mention | The `e7-t08` eval measures it; the prompt asks for skills as written in the ad |
| Users paste ads they have no right to store | Stored privately per user, never shared or published — the same position as a bookmark |

## Open questions

- [ ] **Q:** Should `seniority` and `workType` be editable by the user when
      extraction gets them wrong? Proposed: not in this epic; notes cover it.
      **A:** _(unanswered)_

## Test plan

- Validation, extraction mapping, the job limit and every route's access
  control have unit or route tests, with the model mocked.
- Frontend: component tests for the form's validation and the list's
  filter; the page is checked by hand against a local backend.
- `e7-t08` measures real extraction quality by hand-run eval.

## Interview notes

<!-- One line per merged task. -->
