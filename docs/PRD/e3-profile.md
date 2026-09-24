---
title: E3 — Profile
status: done
epic: E3
owner: GeneCLee6
depends_on: [e2-t01]
---

## Background

The assistant gives better advice when it knows who it is talking to. A
user's role (student, career changer, …), target field and goal are
collected once, at onboarding, and fed into every conversation. They are
therefore **model input, not just profile data**: changing the list of
options changes what the model sees (`AI.md`).

## Goals

- Onboarding that asks for role, field and goal once.
- A settings page to change them, the display name, the password and the
  avatar.
- Option lists wide enough that most users find themselves in them, stored
  as readable words.

## Non-goals

- No public profile pages; a profile is visible only to its owner and the
  assistant.
- No account deletion from the UI yet (the Privacy Policy says so and offers
  email instead).

## Requirements

### Functional

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/users/me` | Read the current user |
| `PUT /v1/users/me` | Update name, display name, role, field, goal |
| `PUT /v1/users/me/password` | Change password while signed in (requires the current one) |
| `POST /v1/users/me/avatar` | Set the avatar from an uploaded `fileKey`; returns the whole user |
| `DELETE /v1/users/:id` | Admin only: soft-delete an account |
| `POST /v1/users/:id/restore` | Admin only: restore a soft-deleted account |

- `role` and `field` come from `src/users/profileOptions.js`, the single list
  behind the Mongoose enum, the zod schema and the labels in the AI prompt:
  - Roles: `Student`, `Graduate`, `Bootcamp`, `SelfTaught`,
    `CareerChanger`, `Professional`, `Other`.
  - Fields: `Frontend`, `Backend`, `FullStack`, `Mobile`, `DataScience`,
    `MachineLearning`, `DevOps`, `Cloud`, `QA`, `Security`, `Design`,
    `ProductManagement`, `Other`.
- Codes stored by earlier versions (`FE`, `BE`, `UIUX`, `Data`) are
  normalised to their new words on read and on write, and
  `scripts/migrate-profile-codes.js` rewrites stored rows.
- `goal` is free text, bounded in length.
- Avatars: JPEG, PNG or WebP, 5 MB, uploaded through the presigned flow
  described in E4.

### Non-functional

- The frontend option lists mirror the backend's and derive their types from
  the arrays, so an option added in one place cannot be half-supported.
- A partial user object from any endpoint must never blank the page.

## Design

`src/users/`; frontend `src/pages/Onboarding`, `src/pages/Settings`,
`src/utils/profileOptions.ts`.

## Acceptance criteria

**As a user, I want to record my role, field and goal, so the assistant's
advice fits me.**

- [x] **AC-E3.1** — Given I have just verified my email, then I am taken to
  onboarding, which asks for role, field and goal.
- [x] **AC-E3.2** — Given a `role` or `field` outside the lists above, then I
  get 400.
- [x] **AC-E3.3** — Given a stored legacy code such as `FE`, when my profile
  is read or saved, then it is treated as its new word (`Frontend`), and
  saving never fails because of it.
- [x] **AC-E3.4** — Given a saved profile, when I send a message, then my
  role, field and goal appear in the system prompt as readable labels.
- [x] **AC-E3.5** — Given the role and field pickers, then the placeholder is
  not offered as an option and a chosen option shows as selected.

**As a user, I want to manage my account.**

- [x] **AC-E3.6** — Given the wrong current password, when I change my
  password, then I get 401 and nothing changes.
- [x] **AC-E3.7** — Given an uploaded image, when I set it as my avatar, then
  the response carries my whole user and the header updates without
  errors.

## Tasks

- [x] <!--e3-t01--> Profile endpoints and password change · AC-E3.2, AC-E3.6 · repo: BE · done in: BE `b64a525` · learn: `/me` routes that take the user from the token, never from the URL
- [x] <!--e3-t02--> Avatar upload through presigned URLs · AC-E3.7 · repo: BE · done in: BE `aa03f1e`, `26df784` · learn: see E4's presigned upload
- [x] <!--e3-t03--> Onboarding, assistant shell and settings screens on shared landing styles · AC-E3.1 · repo: FE · done in: FE#3 · learn: design tokens shared across pages
- [x] <!--e3-t04--> Avatar endpoint returns the whole user; the frontend refuses to let a partial user blank the page · AC-E3.7 · repo: BE, FE · done in: BE#13, FE#14 · learn: API responses as contracts; defensive rendering
- [x] <!--e3-t05--> Wider role and field options; the placeholder fix · AC-E3.2, AC-E3.5 · repo: BE, FE · done in: BE#19, FE#20 · learn: one source of truth for an enum across database, validation and prompt
- [x] <!--e3-t06--> Role and field stored as words, legacy codes normalised, migration script with `--dry-run` · AC-E3.3, AC-E3.4 · repo: BE, FE · done in: BE#20, FE#21 · learn: changing stored values without breaking existing rows; data migrations

## Concepts

**One list, many consumers.** The role list feeds a Mongoose enum, a zod
schema, prompt labels and a frontend select. Defining it once and deriving
the rest means adding an option cannot leave one consumer behind. First met
in `e3-t05`.

**Data migrations.** Renaming a stored value means old rows still hold the
old one. Normalising on read keeps old rows working today; a migration
script cleans them for good. First met in `e3-t06`.

## Closed gaps

- `POST /users/me/avatar` returned only `{ avatar }`, so the client replaced
  its whole user object with one field and crashed rendering the header.
  Closed in BE#13, with a defensive guard in FE#14.

## Test plan

`profileOptions` tests cover the lists and legacy normalisation; frontend
tests cover option typing and the select. The migration was dry-run before
running against the database.

## Interview notes

- Moved role and field from terse codes to readable words across database,
  validation, prompt and UI with zero broken profiles: normalise on read,
  then a dry-runnable migration.
