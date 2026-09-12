# CareerMate AI — Backend Engineering Rules

The guiding principles are **SOLID, DRY, KISS**. This document explains *why*
the code is split the way it is; `ARCHITECTURE.md` describes what the folders
and data flow actually look like.

Sections 8–10 — branches, pull requests and CI — are **identical to
`CareerMate-FE`**. Both repositories follow them.

## 1. SOLID, concretely

### 1.1 Single responsibility

Each layer does one thing:

- **route** (`*.routes.js`): declares paths and middleware order. No logic.
- **validation** (`*.validation.js`): validates and normalises input. Never
  touches the database.
- **controller** (`*.controller.js`): orchestrates and authorises. Never calls
  a third-party SDK directly.
- **service** (e.g. `chat/claude.service.js`): talks to an external service
  and translates its errors into this project's exceptions.
- **model**: describes shape and indexes.

Forbidden: calling `new Anthropic()` inside a controller; querying the
database inside a validation schema to check whether an email is taken.

### 1.2 Open/closed

- **Adding an upload type** (say a portfolio zip) means one more entry in
  `ALLOWED_TYPES` / `MAX_FILE_SIZE` in `upload.validation.js`, and no change
  to `getPresignedUploadUrl`.
- **Changing AI provider** means replacing the inside of
  `chat/claude.service.js` while keeping `createReply({ user, resumes,
  history })` and `isConfigured()`. `chat.controller.js` does not change.

### 1.3 Liskov substitution

Every class under `exceptions/` extends `AppException` and carries a `status`
and a readable `message`. `error.middleware` depends on those two fields only
and special-cases no subclass.

### 1.4 Interface segregation

Middleware is separate and individually applicable: `authGuard` (identity),
`roleGuard` (permission), `validateBody` (input), `rateLimiter` (traffic).
There is no catch-all middleware that forces routes to load checks they do
not need.

### 1.5 Dependency inversion

- Controllers depend on the functions `claude.service` exports, not on
  `@anthropic-ai/sdk` types or error classes. The SDK is imported only inside
  the service.
- The benefit is already proven: `claude.service.test.js` mocks
  `@anthropic-ai/sdk` alone to test the entire error mapping — no key needed,
  no money spent.

## 2. DRY

| Logic that tends to get duplicated | Where it lives |
| --- | --- |
| Reading env vars and checking required ones | `utils/config.js`. No file reads `process.env` on its own |
| The password rule (8 chars, letter and digit) | `passwordSchema` in `auth/auth.validation.js`, imported by `users/user.validation.js` |
| Upload type and size limits | `ALLOWED_TYPES` / `MAX_FILE_SIZE` in `upload/upload.validation.js`, imported by the resume module |
| Verification/reset code generation, hashing, expiry, cooldown | `utils/verificationCode.js` |
| S3 operations | `utils/s3.js` |
| Error response shape | `middleware/error.middleware.js`. Controllers `throw`; they never build an error response themselves |
| Ownership checks | A `findOwnXxx(id, userId)` helper per module (`findOwnResume`, `findOwnConversation`) |

## 3. KISS

This is a course and portfolio project. Deliberately not done:

- No microservices; one Express application is enough.
- No DI container — `require` is the simplest dependency injection there is.
- No repository pattern wrapping Mongoose; Mongoose is already the data
  access layer.
- No conversation summarisation yet; "the last 40 messages" is sufficient.
- No chase for 100% coverage (see §6).

## 4. Naming

- Files: `<module>.<responsibility>.js` — `auth.controller.js`,
  `chat.validation.js`, `claude.service.js`.
- Middleware: `<name>.middleware.js`.
- Exceptions: `<name>.exception.js`, exporting `XxxException`.
- Constants: upper snake case (`MAX_FILE_SIZE`, `HISTORY_LIMIT`).
- Ownership helpers: `findOwnXxx`.

## 5. Security rules that are not negotiable

1. Keys live only in `.env`, and `.env` is in `.gitignore`. When a setting is
   added, update `.env.example` too — **field names only, never values**.
2. Before touching a resource someone else might own, compare
   `resource.user.toString() === req.user.id`.
3. A 5xx response must never return `err.message`.
4. Passwords go through bcrypt. Never hand-roll hashing or salting.
5. No response may contain `password`, `passwordHistory`, `verificationCode`,
   `resetCode` or `resetToken`.
6. A code sent by email is stored hashed, never in plain text, and is
   compared with a constant-time comparison.

## 6. Testing philosophy

- **Must be tested**: pure logic and anything security-related — zod schemas,
  password hashing, JWT signing and verification (including forged, tampered
  and expired tokens), code generation and expiry, `claude.service`'s error
  mapping and refusal branch, `error.middleware`'s 4xx/5xx split.
- **Should be tested**: controller failure paths, such as whether the user's
  message is rolled back when the reply fails.
- **Not required**: Mongoose field definitions themselves.
- **External services are always mocked.** A test must never really call
  Anthropic, AWS or Brevo, or connect to a production database.
  `claude.service.test.js` is the template.
- Test files sit **next to** what they test (`claude.service.test.js` beside
  `claude.service.js`). There is no separate `tests/` directory.

> Known trap: `utils/config.js` freezes `process.env` when it loads. To change
> settings in a test you must `jest.mock("../utils/config")`; mutating
> `process.env` in `beforeEach` does nothing. If one file needs both a
> "configured" and an "unconfigured" scenario, split it into two test files —
> see `claude.service.unconfigured.test.js`.

## 7. Commit messages

Simplified Conventional Commits: `<type>: <description>`.

**Everything written in this project is in English** — commits, pull
requests, code comments, documentation, and UI copy. The repository is a
portfolio piece read by people who do not read Chinese.

```
feat: add the AI chat API
fix: stop 500s leaking internal error messages
refactor: extract shared landing styles
docs: add PRD and RULES
test: cover the refusal path in claude.service
chore: bump user-event to v14
```

Common types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`.

The subject says what was done, not which file changed. The body — optional —
says **why**, and records any trade-off that is not obvious from the diff.

## 8. Branch naming

Format: `<type>/<kebab-case-summary>`

| Prefix | Use | Example |
| --- | --- | --- |
| `feat/` | New capability | `feat/ai-chat`, `feat/email-verification` |
| `fix/` | Bug fix | `fix/rate-limiter-and-error-leak` |
| `refactor/` | Behaviour-preserving change | `refactor/landing-shared-styles` |
| `docs/` | Documentation only | `docs/project-docs-and-ci` |
| `test/` | Tests only | `test/auth-routes` |
| `chore/` | Dependencies, configuration | `chore/bump-mongoose` |

Rules:

- Always branch from the **latest `main`** (`git pull --ff-only` first).
- Lower-case English with hyphens. No underscores.
- **One branch, one concern.** A refactor noticed while fixing a bug gets its
  own branch unless it is part of the fix.
- Delete a branch once it is merged.
- Never push directly to `main`.

## 9. Pull requests

**Title**: same format as a commit — `<type>: <description>`.

**The body must contain:**

1. **Why** — the problem being solved, or why now.
2. **What changed** — the points that matter, not a translation of the diff.
3. **How it was verified** — commands actually run and their results (how
   many tests passed, which scenarios were exercised by hand).
4. **Known gaps** — related things this PR does not do, stated honestly.

Other rules:

- For a bug fix, **include the real output from before the fix** (status code,
  error message), to show the problem existed rather than was assumed.
- Keep pull requests small and complete. Past roughly 400 changed lines,
  consider splitting.
- State cross-repository dependencies explicitly (for example, a frontend PR
  that needs a backend PR merged first).
- CI must be green before merging (see §10).

## 10. CI

CI is defined in `.github/workflows/ci.yml` and runs on pushes to `main` and
on every pull request targeting `main`.

| Check | Command | A failure means |
| --- | --- | --- |
| Tests | `npm test` | Logic is broken |
| Boot check | Load `src/app.js` | A syntax error or a bad require path |

Rules:

- **A red build is not merged.**
- CI must never need a real key. Tests mock every external service, and the
  workflow supplies only dummy values for required settings such as
  `JWT_SECRET`.
- When a test command is added, update the workflow in the same PR.
