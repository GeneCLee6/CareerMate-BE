# CareerMate AI — Backend Product Requirements

## 1. Overview

**CareerMate AI** is an AI-first job-preparation platform for students and
junior engineers. It helps with three things: **improving a resume, practising
interviews, and planning a career**.

This document covers **CareerMate-BE**, the Node.js service that exposes the
REST API for accounts, profiles, resume files and AI conversations. The
interface users actually see lives in a separate repository
(**CareerMate-FE**); the two communicate over HTTP under `/v1`.

**Version 2** (planned, §3.5–§3.7) turns the assistant into a job-search
copilot: users save the job ads they are interested in, and the assistant
answers questions across them with retrieval-augmented generation (RAG),
citing the ads it drew on. An evaluation harness measures answer quality,
so model and retrieval choices are made with data rather than by feel.

The backend's goal is not to own every piece of logic. It is to be **the only
source of truth the frontend can trust, and the only place that holds
secrets**. Every key — database, AWS, Anthropic, Brevo — exists only here.
The frontend must never hold one.

## 2. Users

- Students and career changers looking for work (the JR Academy AI
  Engineering course setting).
- One role dominates: the ordinary user (`accountType: "user"`). An `admin`
  role exists but is used only for soft-deleting and restoring accounts, and
  has no frontend.
- Multi-user with per-account isolation. Every user may reach **only** their
  own resumes and conversations. This is a hard requirement, not a later
  hardening pass.

## 3. Functional requirements

### 3.1 Accounts and authentication (`/v1/auth`)

| Endpoint | Purpose | Notes |
| --- | --- | --- |
| `POST /auth/register` | Create an unverified account and email a code | 201, **no token** |
| `POST /auth/verify-email` | Confirm the code; the account becomes usable | Returns the session |
| `POST /auth/resend-verification` | Send a fresh code | 429 inside the cooldown |
| `POST /auth/login` | Sign in | 401 on bad credentials, **403 while unverified** |
| `POST /auth/forgot-password` | Email a six-digit reset code | Always 200, see §4 B2 |
| `POST /auth/verify-code` | Exchange a valid reset code for a `resetToken` | 401 if wrong or expired |
| `POST /auth/reset-password` | Set a new password using the `resetToken` | Rejects previously used passwords |

- Password rule: at least 8 characters, containing both a letter and a digit.
  This rule is the **single source of truth**; the frontend only mirrors it to
  give earlier feedback.
- Passwords are hashed with bcrypt (12 rounds). A short `passwordHistory` is
  kept so a password cannot be reused.
- Verification and reset codes are six digits from `crypto.randomInt`, stored
  **hashed**, valid for 10 minutes, limited to 5 attempts, and rate-limited to
  one send per minute per account.
- Authentication is a JWT in `Authorization: Bearer <token>`, valid 7 days.

### 3.2 Profile (`/v1/users`)

| Endpoint | Purpose |
| --- | --- |
| `GET /users/me` | Read the current user |
| `PUT /users/me` | Update name, display name, role, field, goal |
| `PUT /users/me/password` | Change password while signed in (requires the current one) |
| `POST /users/me/avatar` | Set the avatar from an uploaded `fileKey` |

- `role` and `field` come from `users/profileOptions.js`, which is the single
  list behind the Mongoose enum, the zod schema and the AI prompt labels.
  `goal` is free text.
- Values already stored on accounts (`Student`, `Other`, `FE`, `BE`) are never
  removed or renamed. Dropping one would make existing profiles fail
  validation on their next save.
- These three fields are also fed into the AI system prompt (§3.4), so they
  are **not only profile data — they are model input**.

### 3.3 Uploads and resumes (`/v1/upload`, `/v1/resumes`)

Two-step upload, so file bytes never pass through the application server:

```
client ──① ask for a presigned URL──► server ──► S3 signature
client ──② PUT the file directly ─────────────► S3 (tmp/ prefix)
client ──③ create the resource with fileKey──► server ──► validate, move
```

- Resumes: PDF only, 10 MB. Avatars: JPEG/PNG/WebP, 5 MB. Enforced on the
  server; the frontend mirrors the rule.
- Uploads land under `tmp/{userId}/`. Only after `validateS3File` confirms
  type and size is the object copied to `resume/{userId}/` and the temporary
  copy deleted.
- **Known constraint**: the S3 bucket must allow PUT from the frontend origin
  via CORS. Without it the browser upload fails while `curl` succeeds, which
  makes the cause easy to misread.

### 3.4 AI chat (`/v1/chat`)

| Endpoint | Purpose |
| --- | --- |
| `GET /chat/status` | Report whether the server has an AI key |
| `GET /chat/conversations` | List the user's conversations |
| `GET /chat/conversations/:id/messages` | Read one conversation |
| `POST /chat/messages` | Send a message, with up to 3 attachments, creating a conversation |
| `POST /chat/conversations/:id/messages` | Continue an existing conversation |
| `DELETE /chat/conversations/:id` | Delete a conversation and its messages |
| `DELETE /chat/conversations` | Delete every conversation the user has |

Behavioural requirements:

- Conversations and messages **must persist**; a refresh must not lose them.
- The system prompt carries the user's `fullName`, `role`, `field`, `goal`
  and the **text of their resumes**, so the model does not re-ask what is
  already known and can quote the document directly.
- Resume text is extracted at upload. A file whose text cannot be read — a
  scan, or an image-only PDF — is listed by name with an explicit instruction
  to ask the user rather than let the model pretend it has read the file.
- Resume text is untrusted input in a system prompt. It must be fenced and
  labelled as data, never merged into the instructions.
- With no `ANTHROPIC_API_KEY`: the service still starts, `/chat/status`
  reports `configured: false`, and sending returns **503**.
- If the reply fails, the user's message is **rolled back**. A conversation
  must never contain a question with no answer.
- A message may carry up to 3 attachments, 5 MB each. Images are read by the
  model directly; PDFs are turned into text by the same extractor the resume
  upload uses. A message that is only an attachment is valid.
- A user must be able to delete their own history. The assistant screen opens
  only the most recent conversation, so a bulk delete is not a convenience —
  without it, older conversations are unreachable and therefore undeletable.
- Attachment bytes are **never stored** — only a filename and type, so a
  reloaded transcript can still show what was sent. Replayed turns tell the
  model the file is no longer available rather than leaving it to guess.

Model choice and parameters are documented in `ARCHITECTURE.md` §5.

### 3.5 Saved jobs (`/v1/jobs`) — planned

| Endpoint | Purpose |
| --- | --- |
| `POST /jobs` | Save a job ad. The pasted ad text is required; title, company and URL are optional |
| `GET /jobs` | List the user's saved jobs, newest first |
| `GET /jobs/:id` | Read one saved job, including its extracted fields |
| `PATCH /jobs/:id` | Update the application status or private notes |
| `DELETE /jobs/:id` | Delete a job together with its chunks and embeddings |

Behavioural requirements:

- The user **pastes** the ad text. Fetching ads from job boards is out of
  scope: their terms forbid scraping, and most pages need a signed-in browser
  to render anyway.
- Ad text must be 200–20,000 characters. A user may keep at most 200 saved
  jobs; the limit keeps storage and embedding cost bounded.
- On save, the model extracts structured fields with structured output:
  title, company, location, work type, seniority, required skills and
  nice-to-have skills. Values the user typed win over extracted ones.
- Extraction failing must not block the save. The job is stored with
  `extractionStatus: "failed"` and can be retried.
- Ad text is untrusted input, exactly like resume text: fenced and labelled
  as data wherever it reaches a prompt.
- Status is one of `saved`, `applied`, `interviewing`, `offer`, `rejected`,
  so the list doubles as an application tracker.

### 3.6 Answers grounded in saved jobs (RAG) — planned

**Indexing.** On save, the ad is split into chunks — by section heading where
the ad has them, otherwise into fixed-size windows with overlap — and each
chunk is embedded and stored in a `jobchunks` collection with its `user` and
`job` ids. The embedding model is recorded in `ARCHITECTURE.md`.

**Retrieval.** A MongoDB Atlas Vector Search index over `jobchunks`,
**pre-filtered on the requesting user's id**. Retrieval must be incapable of
returning another user's job; the filter is part of the query, never a
post-processing step.

**Use in chat.** The assistant is given two tools and decides when to call
them:

| Tool | Answers | How |
| --- | --- | --- |
| `search_saved_jobs` | "Which of my saved jobs suit my resume?", "Which ones mention visa sponsorship?" | Vector search, top 8 chunks, returned with their job id and title |
| `summarise_saved_jobs` | "Which skills come up most across my saved jobs?" | A MongoDB aggregation over the extracted fields |

The split is deliberate. Retrieval returns the few most similar chunks, so it
cannot count or rank across *all* jobs; questions about the whole set are
answered from structured data instead.

- A reply that draws on saved jobs must name the jobs it used.
- When nothing relevant is retrieved, the assistant says so rather than
  answering from general knowledge as if it had found something.
- If the embedding service is unavailable, the job is still saved with
  `indexStatus: "pending"` and indexed later by a backfill script; the tool
  reports that search is temporarily unavailable.
- Deleting a job deletes its chunks.

### 3.7 Evaluation harness (`evals/`) — planned

Evals measure answer quality. They call paid APIs, so they are **run by hand
and never in CI or `npm test`**.

- Each eval is a Node script run with `npm run eval:<name>`. It prints a
  summary table and writes per-case results — scores, model configuration,
  token cost — to `evals/results/`, which is gitignored.
- Datasets are JSON files in the repository, **synthetic or anonymised
  only**. No real person's resume or data is committed.
- Where an LLM grades answers, the grader is checked against at least 20
  cases labelled by hand by the project owner, and the agreement rate is
  reported next to every result. A grader that has not been checked is not
  evidence.

| Eval | Question it answers | Metrics |
| --- | --- | --- |
| `resume-review` | Which configuration reviews a resume best — effort `medium` or `high`, resume sent as extracted text or as the PDF itself? | Recall of issues planted in each test resume; specificity; claims not supported by the resume; cost per review |
| `retrieval` | Does search find the right saved jobs? | Recall@k and MRR on questions with known relevant jobs. Cheap: embeddings only, no chat model |
| `grounded-answers` | Are answers about saved jobs faithful to them? | Share of claims supported by retrieved text; correct citations; correct "nothing found" |

## 4. User stories and acceptance criteria

Acceptance criteria are written as Given / When / Then so they read as test
names. Each one is covered either by a test in the suite or by a verified run
against real infrastructure.

### Epic A — Registration and email verification

**A1. As a new user, I want to create an account with my email address, so
that I can start using the assistant.**

- Given a valid name, email and password, when I register, then the account
  is created, a six-digit code is emailed to me, and the response contains
  **no token**.
- Given an email that is already registered, when I register, then I get 409
  and no second account is created.
- Given a password shorter than 8 characters, or with no digit, or with no
  letter, when I register, then I get 400 with a message naming the rule.
- Given an email with surrounding whitespace or capitals, when I register,
  then it is trimmed and lowercased before validation, and the account is
  created.

**A2. As a new user, I want to confirm my email with a code, so that my
account becomes usable.**

- Given the correct code within 10 minutes, when I submit it, then my account
  is marked verified and I receive a session token.
- Given a wrong code, when I submit it, then I get 401, the attempt is
  counted, and the account stays unverified.
- Given 5 wrong attempts, when I try again, then the stored code is discarded
  and I must request a new one.
- Given a code older than 10 minutes, when I submit it, then I get 401.
- Given an account that is already verified, when I submit any code, then I
  am told it is already verified rather than given a generic failure.

**A3. As a user who did not receive the email, I want to request another
code.**

- Given more than 60 seconds since the last send, when I ask for a new code,
  then one is sent and the previous code stops working.
- Given fewer than 60 seconds, then I get 429 and no email is sent.

**A4. As an unverified user, I want to be told why I cannot sign in.**

- Given a correct password on an unverified account, when I log in, then I
  get **403** with a message about verification — not 401, which would read
  as a wrong password.

### Epic B — Sign-in and password recovery

**B1. As a returning user, I want to sign in.**

- Given correct credentials on a verified account, when I log in, then I
  receive a token valid for 7 days, plus my profile.
- Given a wrong password, or an address with no account, then I get 401 with
  the same message in both cases — the response must not reveal which
  addresses are registered.

**B2. As a user who forgot my password, I want to reset it by email.**

- Given any address, when I request a reset, then I get 200 whether or not an
  account exists; only a registered address receives a code.
- Given a valid code, when I verify it, then I receive a short-lived
  `resetToken`.
- Given a valid `resetToken` and a new password, when I reset, then the
  password changes.
- Given a new password matching one in my password history, then I get 400
  and the password is unchanged.

### Epic C — Profile

**C1. As a user, I want to record my role, field and goal, so the
assistant's advice fits me.**

- Given `role` outside `Student`/`Other`, or `field` outside `FE`/`BE`, then
  I get 400.
- Given a saved profile, when I open a conversation, then those values appear
  in the system prompt.

**C2. As a user, I want to change my password while signed in.**

- Given the wrong current password, then I get 401 and nothing changes.

### Epic D — Resumes

**D1. As a user, I want to upload my resume, so the assistant knows which
document we are discussing.**

- Given a PDF of 10 MB or less, when I upload it, then it is stored and
  appears in my list.
- Given a non-PDF, or a file over 10 MB, then it is rejected **by the
  server**, not only by the browser.
- Given a file uploaded to the temporary prefix that is never confirmed, then
  it does not appear in my list.

**D2. As a user, I want to delete a resume.**

- Given a resume that belongs to me, when I delete it, then both the database
  record and the S3 object are removed.
- Given a resume id belonging to another user, then I get 404 — **not** 403,
  which would confirm the id exists.

### Epic E — AI conversation

**E1. As a user, I want to ask the assistant about my job search and get a
useful answer.**

- Given a message, when I send it, then my message and the reply are both
  persisted and returned together.
- Given the model call fails, then my message is removed and the error names
  the real cause.
- Given no API key is configured, then `/chat/status` reports
  `configured: false` and sending returns 503 — the server still starts.
- Given the model refuses to answer, then that is surfaced as a refusal
  rather than as a transport error (the Anthropic API returns HTTP 200 for a
  refusal).

**E2. As a user, I want my conversations to still be there tomorrow.**

- Given a conversation created yesterday, when I list conversations, then it
  appears, ordered by most recent activity.
- Given another user's conversation id, then I get 404.

### Epic F — Saved jobs (planned)

**F1. As a user, I want to save a job ad I am interested in, so I can come
back to it and ask about it.**

- Given ad text of 200–20,000 characters, when I save it, then it appears at
  the top of my list with its extracted fields filled in.
- Given text shorter than 200 or longer than 20,000 characters, then I get
  400 with a message saying which limit was broken.
- Given I already have 200 saved jobs, then I get 400 telling me to delete
  some first.
- Given extraction fails, then the job is still saved, marked
  `extractionStatus: "failed"`.

**F2. As a user, I want to track where each application is up to.**

- Given a saved job, when I set its status to `applied`, then the list shows
  the new status.
- Given a status outside the allowed set, then I get 400.
- Given another user's job id, then I get 404.

**F3. As a user, I want to delete a saved job.**

- Given a job that belongs to me, when I delete it, then the job and all of
  its chunks are removed.
- Given another user's job id, then I get 404.

### Epic G — Ask across saved jobs (planned)

**G1. As a user, I want to ask which of my saved jobs suit me best, and why.**

- Given saved jobs and a resume, when I ask, then the reply names specific
  saved jobs and explains the fit from their content and my resume.
- Given no saved jobs, then the assistant says so and suggests saving some,
  rather than inventing jobs.

**G2. As a user, I want my saved jobs to stay private.**

- Given another user's saved jobs, then no search of mine ever returns them.
  Tested on the query itself: the user filter is always present.

**G3. As a user, I want to know which skills my target jobs keep asking for.**

- Given saved jobs, when I ask which skills come up most, then the answer is
  built from counts over all my saved jobs, not from a handful of retrieved
  chunks.

**G4. As a user, I want saving to work even when search is down.**

- Given the embedding service is unavailable, when I save a job, then it is
  saved with `indexStatus: "pending"` and the assistant reports that search
  is temporarily unavailable.

### Epic H — Evidence of answer quality (planned, developer-facing)

**H1. As the developer, I want to compare assistant configurations on resume
review, so model choices are made with data.**

- Given the resume-review dataset and two configurations, when I run the
  eval, then I see a score and a cost per configuration side by side.
- Given an LLM grader, then its agreement with my hand labels is printed next
  to the scores.

**H2. As the developer, I want to measure retrieval, so a change to chunking
or the embedding model can be judged.**

- Given the retrieval dataset, when I run the eval before and after a change,
  then recall@k and MRR are shown for both.

**H3. As the developer, I want to know whether answers about saved jobs are
faithful to them.**

- Given the grounded-answers dataset, when I run the eval, then I see the
  share of supported claims, citation accuracy, and the rate of correct
  "nothing found" answers.

## 5. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Data isolation | Every resource access verifies `resource.user === req.user.id`. "The frontend would not send someone else's id" is not a control |
| Secret management | Keys exist only in the backend `.env` — never in code, commits, or responses |
| Error messages | 4xx messages are written for users and pass through; 5xx returns a generic message and logs the detail |
| Rate limiting | 100 requests / 15 minutes globally; skipped in `dev` and `test` |
| Observability | Every 5xx leaves method, path, message and stack in the log |
| Cost | Tests never call a paid API. The suite must be free to run in CI |
| Retrieval isolation | Every vector search is pre-filtered on the requesting user's id, inside the query |
| Eval data | Eval datasets are synthetic or anonymised; no real person's data is committed |

## 6. Out of scope

- No multi-tenancy or organisation accounts; `admin` is a minimal capability.
- No self-hosted mail server — transactional email goes through a provider.
- No streaming replies (SSE/WebSocket); this is request/response.
- No paid plans, quotas or billing.
- No pursuit of 100% test coverage; the strategy is in `RULES.md` §6.
- No scraping or automatic import from job boards; ads are pasted in.
- No automatic job applications.

## 7. Delivery status

| Epic | Status |
| --- | --- |
| A — Registration and email verification | ✅ Done |
| B — Sign-in and password recovery | ✅ Done |
| C — Profile | ✅ Done |
| D — Resumes | ✅ Done |
| E — AI conversation | ✅ Done |
| F — Saved jobs | Planned |
| G — Ask across saved jobs | Planned |
| H — Evidence of answer quality | Planned |

### Remaining tasks, in priority order

| # | Task | Why it matters | Size |
| --- | --- | --- | --- |
| 1 | Add route-level integration tests | The suite covers logic units; wiring is covered only by manual runs | M |
| 2 | Authenticate a sending domain (SPF/DKIM/DMARC) | Until then the provider rewrites the From address and deliverability suffers — see `DEPLOY.md` | M |
| 3 | Stream chat replies | A long answer arrives all at once after a visible wait | L |

### Version 2 build order

Each step is one small pull request. Evals come first: they need no new
feature, and every later step is then measured rather than guessed.

| # | Step | Covers |
| --- | --- | --- |
| 1 | Eval harness and the `resume-review` eval on the current assistant | H1 |
| 2 | Saved jobs: model, CRUD endpoints, status tracking | F1 (without extraction), F2, F3 |
| 3 | Structured extraction on save | F1 |
| 4 | Chunking, embeddings, Atlas Vector Search index, backfill script | G4 |
| 5 | `search_saved_jobs` tool in chat | G1, G2 |
| 6 | `retrieval` eval | H2 |
| 7 | `summarise_saved_jobs` tool | G3 |
| 8 | `grounded-answers` eval | H3 |

The frontend (a saved-jobs page and status board) follows from step 2; its
requirements go into the frontend PRD when that step starts.

### Closed gaps, kept for the record

- Email delivery did not exist: `forgotPassword` generated a code and never
  sent it. Closed by the Brevo integration.
- Reset codes were stored in plain text and compared with `!==`. They are now
  bcrypt-hashed, with an attempt limit.
- The rate limiter imported winston's `config`, so `NODE_ENV` was undefined
  and it never skipped in development.
- 5xx responses returned `err.message`, leaking Mongoose internals, and were
  never logged.
- `shutdown` referenced `mongoose` without importing it, so graceful shutdown
  threw and exited 1 with the connection still open.
- The assistant could not read resume contents, only filenames — the gap that
  most undercut the product's promise. Closed by extraction at upload.
- `POST /users/me/avatar` returned only `{ avatar }`, so the client replaced
  its whole user object with one field and crashed rendering the header.
- Sign-in returned a different message for an unknown address than for a
  wrong password, so accounts could be enumerated.
- `register` reissued a verification code with no cooldown, which made it a
  way around the one on `resend-verification`.
- A malformed document id reached Mongoose and became a 500 instead of a 404.
- Another user's conversation answered 403, which confirms the id exists.
- `cors()` accepted any origin.
- `authGuard` checked only the signature, so a deleted account's token kept
  working until it expired.

## 8. Definition of Done

A feature is done when all of the following hold:

- The endpoint has zod validation, and its error messages are readable by a
  user.
- Access control is enforced if user data is involved.
- Failure paths have defined behaviour — rollback, status code, message — not
  "it happens not to break".
- Tests cover the core logic **and** the failure branches.
- `npm test` passes and CI is green.
