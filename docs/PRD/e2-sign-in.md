---
title: E2 — Sign-in and password recovery
status: done
epic: E2
owner: GeneCLee6
depends_on: [e1-t01]
---

## Background

A verified user signs in with email and password and receives a session. A
user who has forgotten the password recovers it through a code sent to the
same inbox that was verified in E1. Both flows are the most attacked part
of any product, so most of the requirements here are about what the
responses must *not* reveal.

## Goals

- Sign-in that returns a session and the user's profile.
- Password recovery by emailed code, without revealing which addresses have
  accounts.
- Sessions that end cleanly when they expire, and signed-in users never
  sent back to a sign-in page.

## Non-goals

- No refresh tokens or "sign out everywhere"; a session is one 7-day JWT.
- No two-factor authentication.

## Requirements

### Functional

| Endpoint | Purpose | Notes |
| --- | --- | --- |
| `POST /v1/auth/login` | Sign in | 401 on bad credentials, 403 while unverified (E1) |
| `POST /v1/auth/forgot-password` | Email a six-digit reset code | Always 200 |
| `POST /v1/auth/verify-code` | Exchange a valid reset code for a `resetToken` | 401 if wrong or expired |
| `POST /v1/auth/reset-password` | Set a new password using the `resetToken` | Rejects recently used passwords |

- Authentication is a JWT in `Authorization: Bearer <token>`, valid 7 days.
  `authGuard` also checks that the account still exists and is not
  soft-deleted, so a deleted account's token stops working at once.
- Reset codes follow the same rules as verification codes (E1): hashed, 10
  minutes, 5 attempts, one a minute.
- A short `passwordHistory` is kept so a recent password cannot be reused.
- Frontend: "Remember me" keeps the session in `localStorage`; otherwise it
  lives only for the tab. An expired session signs the user out with a
  message, instead of failing requests one by one.

### Non-functional

- Responses for an unknown address and for a wrong password are identical,
  in status and message.

## Design

`src/auth/auth.controller.js` for the endpoints, `src/utils/jwt.js` and
`src/middleware/authGuard.middleware.js` for sessions. Frontend:
`AuthContext`, `ProtectedRoute`, `GuestOnlyRoute`.

## Acceptance criteria

**As a returning user, I want to sign in.**

- [x] **AC-E2.1** — Given correct credentials on a verified account, when I
  log in, then I receive a token valid for 7 days, plus my profile.
- [x] **AC-E2.2** — Given a wrong password, or an address with no account,
  then I get 401 with the same message in both cases.
- [x] **AC-E2.3** — Given my session expires while I use the app, then I am
  signed out once, told why, and taken to sign-in.
- [x] **AC-E2.4** — Given I am signed in, when I open sign-in, registration
  or password recovery, or press "Start" on the landing page, then I am
  taken into the app instead.
- [x] **AC-E2.5** — Given my account is deleted, then my existing token stops
  working on the next request.

**As a user who forgot my password, I want to reset it by email.**

- [x] **AC-E2.6** — Given any address, when I request a reset, then I get 200
  whether or not an account exists; only a registered address receives a
  code.
- [x] **AC-E2.7** — Given a valid code, when I verify it, then I receive a
  short-lived `resetToken`.
- [x] **AC-E2.8** — Given a valid `resetToken` and a new password, when I
  reset, then the password changes.
- [x] **AC-E2.9** — Given a new password matching one in my password history,
  then I get 400 and the password is unchanged.

## Tasks

- [x] <!--e2-t01--> Login, JWT issue and `authGuard`, forgot / verify-code / reset-password endpoints with password history · AC-E2.1, AC-E2.7, AC-E2.8, AC-E2.9 · repo: BE · done in: BE `b64a525` · learn: what a JWT is and is not; stateless sessions
- [x] <!--e2-t02--> Reset codes hashed with an attempt limit, and actually emailed — before this, `forgotPassword` generated a code and never sent it · AC-E2.6, AC-E2.7 · repo: BE · done in: BE#4 · learn: a feature that "works" in tests but never reaches the user
- [x] <!--e2-t03--> Sign-in, forgot-password and reset screens from the Zeplin design · AC-E2.1, AC-E2.6–AC-E2.8 · repo: FE · done in: FE#2, FE#5 · learn: turning a design file into components
- [x] <!--e2-t04--> Expired sessions handled once, globally, with a toast; frontend tests · AC-E2.3 · repo: FE · done in: FE#6 · learn: one interceptor instead of a check in every call
- [x] <!--e2-t05--> Same response for unknown address and wrong password · AC-E2.2 · repo: BE · done in: BE#9 · learn: account enumeration
- [x] <!--e2-t06--> Deleted accounts' tokens rejected by `authGuard` · AC-E2.5 · repo: BE · done in: BE#10 · learn: the limit of stateless tokens, and the cost of checking state anyway
- [x] <!--e2-t07--> Guest-only routes: a signed-in user is sent into the app, not asked to sign in again · AC-E2.4 · repo: FE · done in: FE#18 · learn: route guards in both directions

## Concepts

**JWT.** A signed token the server can verify without a database lookup.
Signed is not encrypted: anyone can read its contents, so it carries an id,
never a secret. First met in `e2-t01`.

**Account enumeration.** If "no such account" and "wrong password" look
different, an attacker can test which emails are registered. Identical
responses close that leak. First met in `e2-t05`.

**Stateless vs stateful sessions.** A JWT stays valid until it expires, even
if the account is deleted. Checking the account on each request trades a
database read for the ability to revoke. First met in `e2-t06`.

## Closed gaps

- Email delivery did not exist: `forgotPassword` generated a code and never
  sent it. Closed by the Brevo integration, BE#4.
- Reset codes were stored in plain text and compared with `!==`. Now
  bcrypt-hashed with an attempt limit, BE#4.
- Sign-in returned a different message for an unknown address than for a
  wrong password, so accounts could be enumerated. Closed in BE#9.
- `authGuard` checked only the signature, so a deleted account's token kept
  working until it expired. Closed in BE#10.

## Test plan

`jwt.test.js`, `password.test.js` and the auth-guard tests cover tokens,
hashing and revocation; frontend tests cover session expiry and route
guards. Recovery was verified end to end with real email.

## Interview notes

- Found and closed an account-enumeration leak in sign-in, and made deleted
  accounts' JWTs stop working immediately by checking the account in the
  auth guard — trading one indexed read per request for revocation.
