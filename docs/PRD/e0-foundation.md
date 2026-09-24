---
title: E0 — Foundation
status: in-progress
epic: E0
owner: GeneCLee6
depends_on: []
---

## Background

Work that every epic stands on but that belongs to none of them: the
server skeleton, the error contract, security hardening, CI, documentation,
deployment, and the public pages every product needs. Numbered E0 because
it comes before, and underneath, everything else.

## Goals

- A server that fails safely: user-readable 4xx, generic 5xx that are
  always logged, clean shutdown.
- Hardening that does not depend on the frontend behaving: CORS allowlist,
  per-client rate limiting, bounded input.
- Every change tested in CI before it can reach `main`, and every merge to
  `main` deployable.
- The product live on the internet, with Terms and a Privacy Policy.

## Non-goals

- No 100% coverage target; the strategy is in `RULES.md` §6.
- No monitoring or alerting service beyond the host's logs.

## Requirements

### Functional

- `GET /health` answers `{ "status": "ok" }` without touching the database.
- Terms of Use and Privacy Policy pages are public, reachable from the
  footer, and describe what the code actually does.

### Non-functional

| Area | Requirement |
| --- | --- |
| Errors | 4xx messages are written for users; 5xx return a generic message and log method, path, message and stack |
| Ids | A malformed id is a 404, never a 500 |
| CORS | Only origins in `CORS_ORIGINS` in production; the local dev server elsewhere |
| Rate limiting | 100 requests / 15 minutes per client in production, keyed on the real client IP behind the host's proxy; skipped in `dev` and `test` |
| Input | Every user-supplied string has a maximum length, on the server; the frontend mirrors the limits |
| Secrets | Only in the backend environment; `REACT_APP_*` holds none |
| CI | Every pull request runs the backend tests and an app-load check, and the frontend typecheck, tests and build; `main` is protected and needs them green |

## Design

`src/app.js` wires middleware in order (trust proxy, helmet, health,
logging, CORS, rate limit, body parsing, routes, error handler);
`src/middleware/error.middleware.js` owns the error contract;
`src/utils/corsOptions.js`, `src/utils/trustProxy.js`, `src/utils/limits.js`.
Hosting: Render (backend), Cloudflare Pages (frontend), MongoDB Atlas, S3 —
see `DEPLOY.md`.

## Acceptance criteria

- [x] **AC-E0.1** — Given an unexpected error, then the client gets a generic
  500 message and the log has method, path, message and stack.
- [x] **AC-E0.2** — Given a malformed id in any route, then I get 404.
- [x] **AC-E0.3** — Given a browser request from an origin not in
  `CORS_ORIGINS` in production, then it is refused; given none configured in
  production, then the server logs that loudly at start-up.
- [x] **AC-E0.4** — Given production behind the host's proxy, when two
  clients send requests, then each has its own rate-limit budget.
- [x] **AC-E0.5** — Given any string field longer than its limit, then I get
  400 from the server.
- [x] **AC-E0.6** — Given `SIGTERM`, then the server stops accepting requests,
  closes the database connection and exits 0.
- [x] **AC-E0.7** — Given a pull request, then CI runs and a failing check
  blocks the merge.
- [x] **AC-E0.8** — Given the deployed product, then the frontend loads on
  every route including a refreshed deep link, the backend answers
  `/health`, and the two talk to each other.
- [x] **AC-E0.9** — Given any visitor, then Terms and Privacy are readable
  without signing in and describe the real data handling.
- [ ] **AC-E0.10** — Given each route, then an integration test exercises it
  through the HTTP layer, not only its units.

## Tasks

- [x] <!--e0-t01--> Server skeleton: config, logger, error handler, database connection, zod and JWT utilities · AC-E0.1 · repo: BE · done in: BE `5f07f03`, `b119fec`, `c83d839` · learn: layering an Express app; where configuration comes from
- [x] <!--e0-t02--> Rate limiter reads the right config; 5xx stop leaking internals and are logged · AC-E0.1 · repo: BE · done in: BE#2 · learn: never send `err.message` for a 500
- [x] <!--e0-t03--> Project docs and CI in both repositories · AC-E0.7 · repo: BE, FE · done in: BE#3, FE#10 · learn: GitHub Actions; branch protection
- [x] <!--e0-t04--> Graceful shutdown that actually shuts down · AC-E0.6 · repo: BE · done in: BE#5 · learn: signals and exit codes
- [x] <!--e0-t05--> Docs rewritten in English with an expanded PRD; `AI.md` · — · repo: BE, FE · done in: BE#7, FE#12, BE#12 · learn: documenting decisions, not just APIs
- [x] <!--e0-t06--> Seed script for a verified local test account · — · repo: BE · done in: BE#8 · learn: reproducible local data
- [x] <!--e0-t07--> Malformed ids answer 404 · AC-E0.2 · repo: BE · done in: BE#9 · learn: validating ids before the database sees them
- [x] <!--e0-t08--> CORS allowlist · AC-E0.3 · repo: BE · done in: BE#10 · learn: what CORS protects, and what it does not
- [x] <!--e0-t09--> Every user-supplied string bounded, limits mirrored in the forms · AC-E0.5 · repo: BE, FE · done in: BE#11, FE#13 · learn: input bounds as a denial-of-service defence
- [x] <!--e0-t10--> Clear the npm audit advisories · — · repo: BE · done in: BE#15 · learn: reading an advisory before upgrading
- [x] <!--e0-t11--> Landing page wired into the auth flow · — · repo: FE · done in: FE#4 · learn: routing between a marketing page and an app
- [x] <!--e0-t12--> Terms and Privacy pages, rebuilt as part of the site, with working anchors off the landing page · AC-E0.9 · repo: FE · done in: FE#22, FE#24, FE#25 · learn: writing policy from what the code does
- [x] <!--e0-t13--> Deploy: Atlas, Render, Cloudflare Pages; trust the proxy for per-client rate limits; deploy docs · AC-E0.4, AC-E0.8 · repo: BE, FE · done in: BE#21, FE#26 · learn: environment configuration; reverse proxies and `X-Forwarded-For`
- [ ] <!--e0-t14--> Route-level integration tests with supertest and an in-memory MongoDB · AC-E0.10 · repo: BE · learn: unit vs integration tests; testing the wiring

## Concepts

**Error contract.** 4xx is the client's fault and its message is for the
user. 5xx is the server's fault; its details are for the log, never the
response, because they reveal internals. First met in `e0-t02`.

**CORS.** A browser rule, not a server defence: it stops other websites'
scripts from reading your API's responses in a user's browser. It does not
stop `curl`. First met in `e0-t08`.

**Reverse proxy.** On a host like Render, requests arrive through a load
balancer; the real client is in `X-Forwarded-For`. Trust it only as far as
the proxies you actually have, or clients can spoof their address. First
met in `e0-t13`.

## Closed gaps

- The rate limiter imported winston's `config`, so `NODE_ENV` was undefined
  and it never skipped in development. BE#2.
- 5xx responses returned `err.message`, leaking Mongoose internals, and were
  never logged. BE#2.
- `shutdown` referenced `mongoose` without importing it, so graceful
  shutdown threw and exited 1 with the connection still open. BE#5.
- A malformed document id reached Mongoose and became a 500 instead of a
  404. BE#9.
- `cors()` accepted any origin. BE#10.
- Behind Render's proxy every request shared one IP, so all users shared
  one rate-limit budget. BE#21.

## Test plan

Unit tests cover CORS options, trust-proxy resolution, id validation and
limits. Deployment was verified from outside: `/health`, CORS preflight
from the real and an unknown origin, a real API round trip, S3 preflight.

## Interview notes

- Deployed a two-repo app on free tiers (Cloudflare Pages, Render, Atlas M0)
  and caught, before launch, that Render's proxy would have put every user
  in one rate-limit bucket — fixed with a scoped `trust proxy` and a test
  proving `req.ip` is the real client.
