---
title: E4 — Resumes
status: done
epic: E4
owner: GeneCLee6
depends_on: [e2-t01]
---

## Background

The resume is what most of the assistant's advice is about. A user uploads
it once; the assistant can then read and quote it in every conversation.
The file itself is stored in S3; the text extracted from it is what the
model actually reads.

## Goals

- Upload a PDF resume and see real progress while it uploads.
- The assistant reads the resume's contents, not just its filename.
- Download and delete resumes.

## Non-goals

- No resume editor or builder.
- No reading of scanned (image-only) PDFs. The assistant is told the file
  could not be read and asks the user instead of pretending.

## Requirements

### Functional

| Endpoint | Purpose |
| --- | --- |
| `POST /v1/upload/presigned-url` | Get a presigned URL for a direct upload to S3 |
| `POST /v1/resumes` | Create a resume from an uploaded `fileKey` |
| `GET /v1/resumes` | List the user's resumes |
| `GET /v1/resumes/:id/download` | Get a short-lived download URL |
| `DELETE /v1/resumes/:id` | Delete the record and the S3 object |

Two-step upload, so file bytes never pass through the application server:

```
client ──① ask for a presigned URL──► server ──► S3 signature
client ──② PUT the file directly ─────────────► S3 (tmp/ prefix)
client ──③ create the resource with fileKey──► server ──► validate, move
```

- PDF only, 10 MB, enforced on the server; the frontend mirrors the rule.
- Uploads land under `tmp/{userId}/`. Only after `validateS3File` confirms
  type and size is the object copied to `resume/{userId}/` and the temporary
  copy deleted.
- On creation the text is extracted (`src/resumes/resumeText.js`) and stored
  with a status: `ok`, `empty` (no text layer) or `failed`. At most 20,000
  characters are stored; at most 6,000 reach a prompt.
- Resumes uploaded before extraction existed are extracted lazily the first
  time they are needed, and `scripts/backfill-resume-text.js` does it in
  bulk.

### Non-functional

- The S3 bucket must allow `PUT` from the frontend origin via CORS. Without
  it the browser upload fails while `curl` succeeds, which makes the cause
  easy to misread.
- Another user's resume id answers 404, never 403.

## Design

`src/upload/`, `src/resumes/`, `src/utils/s3.js`; frontend `src/api/upload.ts`
(an XHR upload, because `fetch` cannot report upload progress).

## Acceptance criteria

**As a user, I want to upload my resume, so the assistant knows which
document we are discussing.**

- [x] **AC-E4.1** — Given a PDF of 10 MB or less, when I upload it, then it is
  stored and appears in my list.
- [x] **AC-E4.2** — Given a non-PDF, or a file over 10 MB, then it is rejected
  **by the server**, not only by the browser, and the UI says why.
- [x] **AC-E4.3** — Given a file uploaded to the temporary prefix that is
  never confirmed, then it does not appear in my list.
- [x] **AC-E4.4** — Given an upload in progress, then I see its real progress.
- [x] **AC-E4.5** — Given an uploaded PDF with a text layer, then the
  assistant can quote its contents; given one without, then the assistant
  says it could not read the file and asks me instead.
- [x] **AC-E4.6** — Given a resume uploaded before extraction existed, when
  the assistant next needs it, then its text is extracted then.

**As a user, I want to manage my resumes.**

- [x] **AC-E4.7** — Given a resume of mine, when I download it, then I get the
  original file through a short-lived link.
- [x] **AC-E4.8** — Given a resume of mine, when I delete it, then both the
  database record and the S3 object are removed.
- [x] **AC-E4.9** — Given a resume id belonging to another user, then I get
  404 — **not** 403, which would confirm the id exists.

## Tasks

- [x] <!--e4-t01--> Presigned upload, `tmp/` validation and move, resume create / list / delete · AC-E4.1, AC-E4.2, AC-E4.3, AC-E4.8, AC-E4.9 · repo: BE · done in: BE `aa03f1e`, `26df784` · learn: presigned URLs; why file bytes should not pass through the API server
- [x] <!--e4-t02--> Uploads pick the right file, give resumes a usable id, and name the real cause of a failure · AC-E4.2 · repo: FE · done in: FE#7, FE#8 · learn: surfacing the real error instead of "something went wrong"
- [x] <!--e4-t03--> Resume text extraction at upload, statuses, and the text in the system prompt, fenced as data · AC-E4.5 · repo: BE · done in: BE#14 · learn: PDF text extraction and its limits; prompt injection through documents
- [x] <!--e4-t04--> Real upload progress through XHR · AC-E4.4 · repo: FE · done in: FE#15 · learn: why `fetch` cannot report upload progress
- [x] <!--e4-t05--> Lazy extraction for older resumes, plus a bulk backfill script · AC-E4.6 · repo: BE · done in: BE#17 · learn: backfilling data after a feature ships
- [x] <!--e4-t06--> Resume download from the resume panel · AC-E4.7 · repo: FE · done in: FE#23 · learn: short-lived download URLs

## Concepts

**Presigned URL.** A time-limited URL the server signs so the browser can
upload straight to S3. The server never handles the bytes, and never hands
out AWS credentials. First met in `e4-t01`.

**Text extraction.** A PDF is a drawing of a page, not a document. Text can
be pulled out only if the PDF has a text layer; a scan has none. Knowing
which case you are in, and telling the model, prevents it pretending to
have read a file it has not. First met in `e4-t03`.

**Backfill.** When a new feature needs data that old rows lack, either
compute it lazily when first needed or run a script over everything. This
epic does both. First met in `e4-t05`.

## Closed gaps

- The assistant could not read resume contents, only filenames — the gap
  that most undercut the product's promise. Closed by extraction at upload,
  BE#14, and for older resumes by BE#17.

## Test plan

`resumeText` tests cover extraction statuses and truncation; S3 and upload
validation are tested with the SDK mocked. Browser upload was verified
against the real bucket, including CORS, locally and after deployment.

## Interview notes

- Made the assistant actually read resumes: text extracted at upload with an
  explicit status, fenced as untrusted data in the prompt, and a lazy
  backfill so resumes uploaded before the feature were not left behind.
