---
title: E1 — Registration and email verification
status: done
epic: E1
owner: GeneCLee6
depends_on: [e0-t01]
---

## Background

A new user needs an account before anything else works, and the account
must belong to a real inbox: the email address is how a user gets back in
after forgetting a password (E2), and how the product reaches them at all.
Registration therefore creates an **unverified** account and emails a code;
the account becomes usable only once that code comes back.

## Goals

- Sign-up with name, email and password, finished by a six-digit emailed
  code.
- No usable session until the email is confirmed.
- Nothing in the flow reveals which addresses are already registered, beyond
  the unavoidable "this email is taken" at sign-up.

## Non-goals

- No social sign-in (Google, GitHub).
- No self-hosted mail server; mail goes through Brevo.

## Requirements

### Functional

| Endpoint | Purpose | Notes |
| --- | --- | --- |
| `POST /v1/auth/register` | Create an unverified account and email a code | 201, **no token** |
| `POST /v1/auth/verify-email` | Confirm the code; the account becomes usable | Returns the session |
| `POST /v1/auth/resend-verification` | Send a fresh code | 429 inside the cooldown |

- Password rule: at least 8 characters, containing both a letter and a
  digit. The backend rule is the **single source of truth**; the frontend
  only mirrors it for earlier feedback.
- Passwords are hashed with bcrypt (12 rounds).
- Codes are six digits from `crypto.randomInt`, stored **hashed**, valid for
  10 minutes, limited to 5 attempts, and sent at most once a minute per
  account.
- Emails are rendered from one template (`src/email/email.template.js`), as
  HTML with a plain-text alternative.

### Non-functional

- Outside production, with no Brevo key, the email is logged instead of
  sent, so the flow can be exercised locally.
- In production, a missing Brevo configuration returns 503 rather than
  silently dropping the code.

## Design

`src/auth/` holds the controller and routes; codes are generated and
checked in `src/utils/verificationCode.js`; delivery is `src/email/`. See
`ARCHITECTURE.md` §6 for email.

## Acceptance criteria

**As a new user, I want to create an account with my email address, so that
I can start using the assistant.**

- [x] **AC-E1.1** — Given a valid name, email and password, when I register,
  then the account is created, a six-digit code is emailed to me, and the
  response contains **no token**.
- [x] **AC-E1.2** — Given an email that is already registered, when I
  register, then I get 409 and no second account is created.
- [x] **AC-E1.3** — Given a password shorter than 8 characters, or with no
  digit, or with no letter, when I register, then I get 400 with a message
  naming the rule.
- [x] **AC-E1.4** — Given an email with surrounding whitespace or capitals,
  when I register, then it is trimmed and lowercased before validation, and
  the account is created.

**As a new user, I want to confirm my email with a code, so that my account
becomes usable.**

- [x] **AC-E1.5** — Given the correct code within 10 minutes, when I submit
  it, then my account is marked verified and I receive a session token.
- [x] **AC-E1.6** — Given a wrong code, when I submit it, then I get 401, the
  attempt is counted, and the account stays unverified.
- [x] **AC-E1.7** — Given 5 wrong attempts, when I try again, then the stored
  code is discarded and I must request a new one.
- [x] **AC-E1.8** — Given a code older than 10 minutes, when I submit it, then
  I get 401.
- [x] **AC-E1.9** — Given an account that is already verified, when I submit
  any code, then I am told it is already verified rather than given a
  generic failure.

**As a user who did not receive the email, I want to request another code.**

- [x] **AC-E1.10** — Given more than 60 seconds since the last send, when I ask
  for a new code, then one is sent and the previous code stops working.
- [x] **AC-E1.11** — Given fewer than 60 seconds — whether I ask through
  resend or by registering again — then I get 429 and no email is sent.

**As an unverified user, I want to be told why I cannot sign in.**

- [x] **AC-E1.12** — Given a correct password on an unverified account, when
  I log in, then I get **403** with a message about verification — not 401,
  which would read as a wrong password.

**As a user, I want the verification email to look like it comes from a real
product.**

- [x] **AC-E1.13** — Given any code email, then it is branded, states the
  expiry, and has a plain-text alternative.
- [ ] **AC-E1.14** — Given a code email, then it is sent from an address on
  the product's own domain and passes SPF, DKIM and DMARC. Blocked on buying
  a domain.

## Tasks

- [x] <!--e1-t01--> User model, register and login endpoints, bcrypt hashing, zod validation · AC-E1.2, AC-E1.3, AC-E1.4 · repo: BE · done in: BE `b64a525` · learn: hashing vs encryption; why the server owns validation
- [x] <!--e1-t02--> Register page with client-side validation, reusable `TextInput`, `useEmail`/`usePassword` hooks · AC-E1.3 · repo: FE · done in: FE#1 and the commits after it · learn: controlled inputs; mirroring server rules in the client
- [x] <!--e1-t03--> Email delivery through Brevo and verification-code registration: hashed codes, expiry, attempt limit, cooldown, 403 for unverified sign-in · AC-E1.1, AC-E1.5–AC-E1.10, AC-E1.12 · repo: BE · done in: BE#4 · learn: one-time codes; storing secrets hashed; a transactional email provider
- [x] <!--e1-t04--> Branded email template with a plain-text alternative, and a preview script · AC-E1.13 · repo: BE · done in: BE#6 · learn: why email HTML is table-based and inline-styled
- [x] <!--e1-t05--> Verify-email step in the sign-up flow, with resend and its countdown · AC-E1.5, AC-E1.10 · repo: FE · done in: FE#11 · learn: multi-step flows; showing a server cooldown in the UI
- [x] <!--e1-t06--> Register can no longer reissue a code inside the cooldown · AC-E1.11 · repo: BE · done in: BE#9 · learn: a limit is only as strong as its weakest entry point
- [ ] <!--e1-t07--> Authenticate a sending domain (SPF, DKIM, DMARC) and send from it · AC-E1.14 · repo: BE · learn: how receivers decide whether to trust an email; see `DEPLOY.md` §6

## Concepts

**Hashing a code.** A verification code is a short-lived password. Storing
it hashed means a leaked database does not hand out working codes. First
met in `e1-t03`.

**Attempt limits and cooldowns.** Six digits is only a million guesses. Five
attempts per code and one code per minute make guessing hopeless — as long
as every route that issues codes applies the cooldown (`e1-t06`).

**401 vs 403.** 401: we do not know who you are (wrong password). 403: we
know, and you may not — here, because the email is unverified. Returning
the right one tells the user what to do next. First met in `e1-t03`.

## Closed gaps

- `register` reissued a verification code with no cooldown, which made it a
  way around the one on `resend-verification`. Closed in BE#9.

## Test plan

Unit tests cover code generation, hashing, expiry and attempt counting
(`verificationCode.test.js`) and the password rule. The full flow was
verified against real Brevo delivery before and after deployment.

## Interview notes

- Registration creates an unverified account and returns no token until an
  emailed code comes back; codes are hashed, expire in 10 minutes, and are
  limited to 5 attempts and one send a minute — including through the
  register route, a bypass I found and closed.
