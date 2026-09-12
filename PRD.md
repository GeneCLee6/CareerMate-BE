# CareerMate AI — Backend Product Requirements

## 1. Overview

**CareerMate AI** is an AI-first job-preparation platform for students and
junior engineers. It helps with three things: **improving a resume, practising
interviews, and planning a career**.

This document covers **CareerMate-BE**, the Node.js service that exposes the
REST API for accounts, profiles, resume files and AI conversations. The
interface users actually see lives in a separate repository
(**CareerMate-FE**); the two communicate over HTTP under `/v1`.

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

- `role` is `Student` or `Other`; `field` is `FE` or `BE`; `goal` is free
  text.
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
| `POST /chat/messages` | Send a message, creating a conversation |
| `POST /chat/conversations/:id/messages` | Continue an existing conversation |
| `DELETE /chat/conversations/:id` | Delete a conversation and its messages |

Behavioural requirements:

- Conversations and messages **must persist**; a refresh must not lose them.
- The system prompt carries the user's `fullName`, `role`, `field`, `goal` and
  their resume **filenames**, so the model does not re-ask what is already
  known.
- The model **cannot read resume contents** today. The system prompt must say
  so plainly and ask the user to paste the relevant section, rather than let
  the model pretend it has read the file.
- With no `ANTHROPIC_API_KEY`: the service still starts, `/chat/status`
  reports `configured: false`, and sending returns **503**.
- If the reply fails, the user's message is **rolled back**. A conversation
  must never contain a question with no answer.

Model choice and parameters are documented in `ARCHITECTURE.md` §5.

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

## 5. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Data isolation | Every resource access verifies `resource.user === req.user.id`. "The frontend would not send someone else's id" is not a control |
| Secret management | Keys exist only in the backend `.env` — never in code, commits, or responses |
| Error messages | 4xx messages are written for users and pass through; 5xx returns a generic message and logs the detail |
| Rate limiting | 100 requests / 15 minutes globally; skipped in `dev` and `test` |
| Observability | Every 5xx leaves method, path, message and stack in the log |
| Cost | Tests never call a paid API. The suite must be free to run in CI |

## 6. Out of scope

- No multi-tenancy or organisation accounts; `admin` is a minimal capability.
- No self-hosted mail server — transactional email goes through a provider.
- No streaming replies (SSE/WebSocket); this is request/response.
- No paid plans, quotas or billing.
- No pursuit of 100% test coverage; the strategy is in `RULES.md` §6.

## 7. Delivery status

| Epic | Status |
| --- | --- |
| A — Registration and email verification | ✅ Done |
| B — Sign-in and password recovery | ✅ Done |
| C — Profile | ✅ Done |
| D — Resumes | ✅ Done |
| E — AI conversation | ✅ Done |

### Remaining tasks, in priority order

| # | Task | Why it matters | Size |
| --- | --- | --- | --- |
| 1 | Extract text from uploaded PDFs and put it in the system prompt | The assistant knows only the filename, which undercuts the product's main promise | L |
| 2 | Restrict `cors()` to known origins | Currently open to any origin | S |
| 3 | Have `authGuard` reject tokens for soft-deleted accounts | A deleted account's token keeps working for up to 7 days | S |
| 4 | Add route-level integration tests | The suite covers logic units; wiring is covered only by manual runs | M |
| 5 | Authenticate a sending domain (SPF/DKIM/DMARC) | Until then the provider rewrites the From address and deliverability suffers — see `DEPLOY.md` | M |
| 6 | Stream chat replies | A long answer arrives all at once after a visible wait | L |

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

## 8. Definition of Done

A feature is done when all of the following hold:

- The endpoint has zod validation, and its error messages are readable by a
  user.
- Access control is enforced if user data is involved.
- Failure paths have defined behaviour — rollback, status code, message — not
  "it happens not to break".
- Tests cover the core logic **and** the failure branches.
- `npm test` passes and CI is green.
