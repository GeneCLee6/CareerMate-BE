# CareerMate AI — Backend Architecture

`PRD.md` says what the service must do. This document says what it actually
looks like and how data moves through it. `RULES.md` says why it is split the
way it is.

## 1. Technology choices

| Area | Choice | Reason |
| --- | --- | --- |
| Runtime | Node.js + Express 5 | Express 5 propagates errors from async handlers natively, so `express-async-errors` is not needed |
| Language | JavaScript (CommonJS) | Continues the existing codebase; TypeScript was not introduced mid-project |
| Database | MongoDB + Mongoose 9 | A document model suits conversations and the loosely-shaped profile fields |
| Validation | zod 4 | Same rule concepts as the frontend, and its messages are fit to show a user |
| Auth | jsonwebtoken + bcryptjs | Stateless tokens; scaling out needs no shared session store |
| File storage | AWS S3 with presigned URLs | File bytes never pass through the app server, saving bandwidth and memory |
| AI | `@anthropic-ai/sdk` (Claude) | See §5 |
| Email | Brevo HTTP API | See §6 |
| Tests | Jest | See `RULES.md` §6 |

## 2. Layering and request flow

The code is organised **by feature**, and each feature folder is split by
responsibility:

```
route  ──►  validation (zod)  ──►  controller  ──►  model / service
  │              │                     │                │
  │              │                     │                └─ touches data and external services only
  │              │                     └─ orchestrates and authorises; no business rule details
  │              └─ validates and normalises input; never touches the database
  └─ declares paths and middleware order only
```

One request, end to end:

```
Request
  └─ helmet → morgan → rateLimiter → express.json → cors
       └─ /v1 router
            └─ authGuard (protected routes)
                 └─ validateBody(schema)
                      └─ controller
                           ├─ Mongoose model (MongoDB)
                           ├─ s3 utils (AWS)
                           ├─ claude.service (Anthropic)
                           └─ email.service (Brevo)
  └─ errorHandler (last; single response shape)
```

## 3. Directory structure

```
src/
├── app.js                  Express assembly — middleware order lives here
├── index.js                Entry point: connect to the database, then listen
├── routes.js               The /v1 table, and where authGuard is mounted
│
├── auth/                   Register, verify, sign in, password recovery
├── users/                  Profile, password change, avatar, admin actions
├── upload/                 Presigned URL issuing
├── resumes/                Resume create, list, download, delete
├── chat/                   AI conversation (see §5)
├── email/                  Transport and templates (see §6)
│
├── middleware/
│   ├── authGuard           Verifies the JWT, populates req.user
│   ├── roleGuard           Checks accountType
│   ├── validation          validateBody(zodSchema)
│   ├── rateLimit           Global limiter
│   ├── morgan              Request logging
│   └── error               Single error response shape (see §7)
│
├── exceptions/             AppException and one subclass per status code
└── utils/                  config, db, jwt, password, verificationCode, s3, logger
```

**Before adding a file, ask** which layer it belongs to: path declaration,
input validation, orchestration, or data access. Putting it in the wrong one
is how authorisation checks end up scattered.

## 4. Data models

| Model | Key fields | Notes |
| --- | --- | --- |
| `User` | email (unique), password, fullName, displayName, role, field, goal, avatar, accountType, passwordHistory, emailVerifiedAt, verificationCode, resetCode/resetToken, deletedAt | `toJSON` strips password, `__v`, accountType, passwordHistory and every code field |
| `Resume` | user, fileKey, fileName, fileSize | **Does not set `toJSON: { virtuals: true }`**, so documents arrive with `_id` and no `id`; the frontend normalises them |
| `Conversation` | user, title, lastMessageAt | Virtuals enabled |
| `Message` | conversation, user, role, content, usage | Virtuals enabled; compound index on `conversation + createdAt` |

> The missing virtuals on `Resume` once caused the frontend to send
> `DELETE /resumes/undefined` and receive a 500. Set
> `toJSON: { virtuals: true }` on every new model.

## 5. AI conversation design

**Model**: `claude-opus-5` with `thinking: { type: "adaptive" }`.

| Parameter | Value | Reason |
| --- | --- | --- |
| `effort` | `medium` | Career conversation is dialogue more than hard reasoning; medium balances latency and cost. Raise it if answers get shallow |
| `max_tokens` | 16000 | A **ceiling, not a target** — unused output tokens are not billed; this only stops long answers being truncated |
| `fallbacks` | `"default"` | A backup model takes over within the same call if the primary refuses |

**Two things that are easy to get wrong:**

1. **A refusal is HTTP 200**, with `stop_reason === "refusal"`. Reading
   `content` without checking first yields an empty reply, so
   `claude.service` handles that branch explicitly.
2. **Match errors on the SDK's typed classes**, never on message text. The
   mapping: `AuthenticationError` → 503, `RateLimitError` → 429,
   `BadRequestError` → 400, any other `APIError` → 502.

**Degraded mode**: `ANTHROPIC_API_KEY` is optional. Without it `getClient()`
throws 503, the service still starts, and `/chat/status` reports
`configured: false`.

**History length**: the most recent 40 messages (`HISTORY_LIMIT`) are sent.
Older ones are dropped; there is no summarisation yet.

## 6. Email

`email/email.service.js` is transport; `email/email.template.js` is content.
They are separate so the templates can be rendered and reviewed without
sending anything (`npm run email:preview`).

Brevo's HTTP API is called directly rather than through their SDK: it is one
endpoint with a stable shape, and one fewer dependency to keep current.

**Degraded mode**: with no `BREVO_API_KEY`/`EMAIL_FROM_ADDRESS`, outside
production the message is written to the log — including the code — so the
whole verification flow can be exercised before any provider exists. In
production that path throws 503 instead, and the code is never logged.

Templates are written for mail clients, not browsers: nested tables, inline
styles only, no images, and a solid `bgcolor` behind every gradient. The
reasons are documented at the top of the template file.

## 7. Error contract

Every error passes through `middleware/error.middleware.js`:

| Status | Sent to the client | Logged |
| --- | --- | --- |
| 4xx | `err.message` as written | No |
| 5xx | The fixed string `Something unexpected happened` | Yes — method, path, message, stack |

The reason: a 4xx message is written for a user (`Email already exists!`),
while a 5xx message is an internal detail — a Mongoose cast error names models
and fields.

The response shape:

```json
success: { "success": true, "data": ... }   or   { "success": true, "message": "..." }
failure: { "success": false, "error": { "message": "..." } }
```

A successful `DELETE` returns **204 with no content**, so the frontend's HTTP
client must handle an empty body.

## 8. Configuration and secrets

`utils/config.js` reads `process.env` once at load and validates the required
keys, throwing at startup if one is missing.

| Category | Variables |
| --- | --- |
| Required | `MONGODB_URI`, `JWT_SECRET`, `S3_BUCKET` |
| Optional | `PORT`, `NODE_ENV`, `LOG_LEVEL`, `JWT_EXPIRES_IN`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `CLOUDFRONT_DOMAIN`, `ANTHROPIC_API_KEY`, `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_SUPPORT_ADDRESS`, `APP_URL` |

**Note for tests**: because config freezes its values when the module loads,
a test that needs different settings must `jest.mock("../utils/config")`.
Changing `process.env` in `beforeEach` has no effect.

The database name inside `MONGODB_URI` is case-sensitive. MongoDB refuses to
create a database differing from an existing one only by case, and reports it
as a 500 on the first write rather than at connection time.
