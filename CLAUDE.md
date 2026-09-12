# CLAUDE.md — CareerMate-BE

Project guidance for Claude Code. Read `RULES.md` and `ARCHITECTURE.md`
before starting work.

## What this is

The backend REST API for CareerMate AI. Node.js + Express 5 + MongoDB,
CommonJS, **no TypeScript**.

The frontend is a separate repository (`CareerMate-FE`). Changing the shape of
an API affects it, so say so in the PR.

## Read first

| Situation | Read |
| --- | --- |
| Adding a feature | `PRD.md` §3 (existing endpoints), `ARCHITECTURE.md` §2 (layering) |
| Touching AI chat | `AI.md`, then `ARCHITECTURE.md` §5 |
| Touching email | `ARCHITECTURE.md` §6 |
| Writing tests | `RULES.md` §6, including the config-mock trap |
| Branching, opening a PR | `RULES.md` §8–10 |
| Deploying | `DEPLOY.md` |

## Hard rules

1. **Never put a key in code, in a commit, or as a value in
   `.env.example`.** The user fills their own keys into `.env`; do not ask
   them to paste one to you.
2. **Never push directly to `main`.** Branch and open a PR.
3. **A 5xx must not return `err.message`** to the client.
   `error.middleware.js` handles this — do not bypass it.
4. **Check ownership before touching a user's resource.** Follow the
   `findOwnXxx` helpers.
5. **Mock every external service in tests.** A test must never cost money or
   reach a production database.
6. **Everything written here is in English** — code, comments, docs, commits,
   PRs, UI copy. This is a public portfolio repository.

## Known traps

- **`utils/config.js` freezes `process.env` at load.** To change settings in a
  test, `jest.mock("../utils/config")`; setting `process.env` in `beforeEach`
  does nothing. If one file needs both "configured" and "unconfigured"
  scenarios, split it into two test files.
- **Set `toJSON: { virtuals: true }` on every new Mongoose model.** `Resume`
  does not, so the frontend receives `_id` with no `id` — which once produced
  `DELETE /resumes/undefined` and a 500.
- **A Claude refusal is HTTP 200** (`stop_reason === "refusal"`), not an
  error. Reading `content` without checking gives an empty string.
- **`DELETE` returns 204 with no body**, so the HTTP client must handle an
  empty response.
- **Express 5 propagates async handler errors natively.** No try/catch
  wrapper calling `next(err)` is needed.
- **The database name in `MONGODB_URI` is case-sensitive.** MongoDB refuses a
  name that differs from an existing database only by case, and reports it as
  a 500 on the first write — not at connection time.

## Commands

```bash
npm run dev            # nodemon, :3000 by default
npm test               # Jest; no keys required
npm run email:preview  # render the emails to tmp/ without sending
```

When verifying an API by hand, `curl` against the real endpoint beats a
throwaway script. Note that **curl does not enforce CORS**, so a browser
upload failure cannot be reproduced with it.

## Current gaps

See `PRD.md` §7. The most limiting one is that **the assistant cannot read
resume contents** — it knows only filenames, which undercuts the product's
main promise.
