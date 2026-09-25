# CareerMate AI — Product Requirements

## 1. Overview

**CareerMate AI** is an AI-first job-preparation platform for students and
junior engineers. It helps with three things: **improving a resume, practising
interviews, and planning a career**.

This repository, **CareerMate-BE**, is the Node.js service that exposes the
REST API for accounts, profiles, resume files and AI conversations. The
interface users actually see lives in **CareerMate-FE**; the two communicate
over HTTP under `/v1`. The requirements for both live here.

**Version 1** (epics E0–E5) is live: accounts with email verification, a
profile, resume upload and extraction, and a resume-aware Claude chat with
attachments.

**Version 2** (epics E6–E8) turns the assistant into a job-search copilot:
users save the job ads they are interested in, and the assistant answers
questions across them with retrieval-augmented generation (RAG), citing the
ads it drew on. An evaluation harness measures answer quality, so model and
retrieval choices are made with data rather than by feel.

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
  own data. This is a hard requirement, not a later hardening pass.

## 3. Epics

Each epic has its own PRD in [`docs/PRD/`](docs/PRD/README.md): requirements,
acceptance criteria, and a task list where one task is one pull request.
The checkboxes there are the only record of progress.

| Epic | Scope | Status |
| --- | --- | --- |
| [E0 — Foundation](docs/PRD/e0-foundation.md) | Server skeleton, error contract, hardening, CI, deployment, legal pages | ✅ Live; integration tests open |
| [E1 — Registration and email verification](docs/PRD/e1-registration.md) | `/v1/auth` sign-up, codes, email | ✅ Done; sending domain open |
| [E2 — Sign-in and password recovery](docs/PRD/e2-sign-in.md) | `/v1/auth` sign-in, sessions, reset | ✅ Done |
| [E3 — Profile](docs/PRD/e3-profile.md) | `/v1/users`, onboarding, settings | ✅ Done |
| [E4 — Resumes](docs/PRD/e4-resumes.md) | `/v1/upload`, `/v1/resumes`, text extraction | ✅ Done |
| [E5 — AI conversation](docs/PRD/e5-ai-conversation.md) | `/v1/chat`, attachments, dictation, history | ✅ Done |
| [E6 — Evidence of answer quality](docs/PRD/e6-evals.md) | Eval harness and three evals | Planned — next |
| [E7 — Saved jobs](docs/PRD/e7-saved-jobs.md) | `/v1/jobs`, extraction, application tracker | Planned |
| [E8 — Answers grounded in saved jobs](docs/PRD/e8-rag.md) | Chunking, embeddings, vector search, tool use | Planned |
| [E9 — Conversation memory](docs/PRD/e9-conversation-memory.md) | One continuous conversation, older messages summarised | Idea — after E8 |

## 4. Non-functional requirements

These apply to every epic. An epic may add its own.

| Area | Requirement |
| --- | --- |
| Data isolation | Every resource access verifies `resource.user === req.user.id`. "The frontend would not send someone else's id" is not a control |
| Retrieval isolation | Every vector search is pre-filtered on the requesting user's id, inside the query |
| Secret management | Keys exist only in the backend environment — never in code, commits, or responses |
| Error messages | 4xx messages are written for users and pass through; 5xx returns a generic message and logs the detail |
| Rate limiting | 100 requests / 15 minutes per client in production; skipped in `dev` and `test` |
| Observability | Every 5xx leaves method, path, message and stack in the log |
| Cost | Tests never call a paid API. The suite must be free to run in CI |
| Eval data | Eval datasets are synthetic or anonymised; no real person's data is committed |

## 5. Out of scope

- No multi-tenancy or organisation accounts; `admin` is a minimal capability.
- No self-hosted mail server — transactional email goes through a provider.
- No paid plans, quotas or billing.
- No pursuit of 100% test coverage; the strategy is in `RULES.md` §6.
- No scraping or automatic import from job boards; ads are pasted in.
- No automatic job applications.

## 6. Definition of Done

A task is done when all of the following hold:

- The endpoint has zod validation, and its error messages are readable by a
  user.
- Access control is enforced if user data is involved.
- Failure paths have defined behaviour — rollback, status code, message — not
  "it happens not to break".
- Tests cover the core logic **and** the failure branches.
- `npm test` passes and CI is green.
- The task's checkbox, and any acceptance criterion it completes, is ticked
  in its epic file in the same pull request.
