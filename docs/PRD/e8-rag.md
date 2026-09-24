---
title: E8 — Answers grounded in saved jobs (RAG)
status: draft          # ready once the open questions are answered
epic: E8
owner: GeneCLee6
depends_on: [e7-t03]   # needs saved jobs and their delete hook
---

## Background

Implements `PRD.md` §3.6 and Epic E8.

Once a user has saved thirty or a hundred job ads, the useful questions are
about the whole set: *which of these suit me*, *which mention visa
sponsorship*, *what do they keep asking for that I lack*. The ads do not fit
in one prompt, and pasting them in by hand defeats the point of saving
them. Retrieval-augmented generation (RAG) solves the first two: find the
few passages that matter, and answer from those. The third needs something
else — counting across every job — and this epic handles it separately on
purpose.

## Goals

- The assistant can search the user's saved jobs and answer from what it
  finds, naming the jobs it used.
- Questions about the whole set are answered from counts over all jobs, not
  from whichever passages happened to rank highest.
- One user's jobs can never appear in another user's answer.
- Saving a job keeps working when the embedding service does not.

## Non-goals

- No search over anything other than saved jobs (not resumes, not the
  web). Resumes already fit in the prompt.
- No hybrid keyword + vector search or re-ranking in this epic. Worth
  measuring later with the `retrieval` eval; not assumed up front.
- No streaming of tool calls to the frontend.

## Requirements

### Functional

**Indexing.** When a job is saved (and when extraction finishes, so the
title is known):

1. The description is split into chunks. Where the ad has section headings
   ("Responsibilities", "About you", "What we offer", …) each section is a
   chunk; otherwise, fixed windows of about 800 characters with 100
   characters of overlap. No chunk exceeds 1,200 characters.
2. Each chunk is prefixed with a short header — `Job: <title> at <company>`
   — so a chunk that says only "5+ years of React" still carries which job
   it belongs to.
3. Each chunk is embedded, and stored in `jobchunks` with `user`, `job`,
   `index`, `text`, `embedding`, and the embedding model's name.
4. The job's `indexStatus` becomes `ok`. On any failure it becomes
   `failed`, the job stays saved, and `scripts/index-pending-jobs.js`
   retries later.

**Retrieval.** `searchSavedJobs(userId, query, k = 8)` embeds the query and
runs `$vectorSearch` on `jobchunks` with `filter: { user: userId }` inside
the stage. It returns the top chunks with their job id, title, company,
status and similarity score. Chunks from one job are grouped so the model
sees each job once.

**Tools in chat.** The assistant gets two tools and decides when to use
them:

| Tool | Input | Returns |
| --- | --- | --- |
| `search_saved_jobs` | `query` (text), optional `status` | Up to 8 passages grouped by job, each with job id, title, company and status |
| `summarise_saved_jobs` | optional `status` | Total job count, and the 20 most frequent required and nice-to-have skills with counts |

- Tool results are fenced and labelled as data in the tool result, like
  resume text in the system prompt.
- At most 3 tool calls per user message; after that the model must answer
  with what it has.
- A reply that used saved jobs names them. The server also records which
  jobs the tools returned on the assistant message (`sources`), so the
  frontend can show them without trusting the model's wording.
- When search finds nothing relevant, the assistant says so instead of
  answering from general knowledge as though it had found something.
- With no saved jobs, the tools say so and the assistant suggests saving
  some.

**Frontend.** Under an assistant reply that used saved jobs, a row of
source chips — job title and company — each linking to that job's detail
view.

### Non-functional

- **Isolation.** The user filter is part of the `$vectorSearch` stage
  itself, never applied afterwards. A post-filter would still leak: the top
  k would be chosen from everyone's chunks and then trimmed.
- **Degradation.** Without an embedding key the service starts, jobs save
  with `indexStatus: "pending"`, and `search_saved_jobs` answers that search
  is unavailable. `summarise_saved_jobs` needs no embeddings and keeps
  working.
- **Cost.** Embeddings are paid per token. A job is embedded once, on save;
  a query once per search. Nothing is re-embedded unless the model changes.
- **Tests** never call the embedding API or need Atlas. The pipeline is
  built by a pure function and tested as data; the database call is mocked.

## Design

```
src/rag/
├── chunk.js            pure: description + title/company → chunks
├── embeddings.js       embedding client; model name and dimensions in one place
├── jobChunk.model.js   the jobchunks collection
├── indexJob.js         chunk → embed → store → set indexStatus
├── vectorQuery.js      pure: builds the $vectorSearch pipeline, filter included
└── searchSavedJobs.js  embed query → run pipeline → group by job
src/chat/tools/
├── searchSavedJobs.tool.js
└── summariseSavedJobs.tool.js
atlas/
└── jobchunks.vector-index.json   the index definition, applied by a script
```

- **Embedding provider**: Voyage AI, the provider Anthropic's documentation
  recommends, called through its HTTP API. The model is chosen in `e8-t02`
  and recorded in `ARCHITECTURE.md`; changing it later means re-indexing,
  which the backfill script already does.
- **Vector index**: an Atlas Vector Search index on `jobchunks.embedding`
  (cosine similarity) with `user` declared as a filter field. The
  definition is committed, so the index is reproducible.
- **Tool loop**: `createReply` in `src/chat/claude.service.js` becomes a
  bounded loop — send, and while the reply asks for a tool, run it and send
  the result back, at most 3 times.
- **`summarise_saved_jobs`** is a MongoDB aggregation over the `jobs`
  collection: `$match` the user (and status), `$unwind` the skill arrays,
  normalise case, `$group` and count, `$sort`, `$limit`. No embeddings.

## Acceptance criteria

- [ ] **AC-E8.1** — Given an ad with section headings, when it is chunked, then
  each section is one chunk; given an ad without, then windows of about 800
  characters with 100 overlapping; given any ad, then no chunk exceeds 1,200
  characters and every chunk starts with the job header.
- [ ] **AC-E8.2** — Given a job is saved and embeddings are available, then its
  chunks are stored with embeddings and the model name, and `indexStatus` is
  `ok`.
- [ ] **AC-E8.3** — Given the embedding service fails or is not configured,
  when I save a job, then it is saved with `indexStatus` `pending` or
  `failed`, and the backfill script later indexes it.
- [ ] **AC-E8.4** — Given any search, then the pipeline's `$vectorSearch` stage
  contains the requesting user's id as a filter. Verified on the built
  pipeline, for every code path that searches.
- [ ] **AC-E8.5** — Given a job is deleted, then all its chunks are deleted.
- [ ] **AC-E8.6** — Given saved jobs and a question about them, when I ask,
  then the assistant calls `search_saved_jobs`, answers from the results,
  names the jobs it used, and the message records those jobs as `sources`.
- [ ] **AC-E8.7** — Given a question the saved jobs cannot answer, then the
  assistant says it found nothing relevant; given no saved jobs, then it
  says so and suggests saving some.
- [ ] **AC-E8.8** — Given a question about the whole set ("which skills come up
  most"), then the assistant uses `summarise_saved_jobs` and the counts
  cover every saved job.
- [ ] **AC-E8.9** — Given a model that keeps requesting tools, then after 3
  tool calls the reply is produced without more.
- [ ] **AC-E8.10** — Given an assistant reply with sources, then the frontend
  shows a chip per job that opens its detail view.

## Tasks

- [ ] <!--e8-t01--> Chunker: `chunk.js` with heading-based and window-based strategies and the job header, exhaustive unit tests including edge cases (no headings, one enormous section, very short ads) · AC-E8.1 · repo: BE · learn: what chunking is and why chunk size is a trade-off; contextual headers
- [ ] <!--e8-t02--> Embedding client: `embeddings.js` for Voyage AI, model and dimensions in one constant, missing key handled as "unavailable", tests with the HTTP call mocked; model choice recorded in `ARCHITECTURE.md` · AC-E8.3 · repo: BE · learn: what an embedding is; similarity; why the same model must embed documents and queries
- [ ] <!--e8-t03--> Index on save: `jobChunk.model.js`, `indexJob.js`, `indexStatus` transitions, chunks deleted with their job, tests with embeddings mocked · AC-E8.2, AC-E8.3, AC-E8.5 · repo: BE · learn: an indexing pipeline; keeping a derived collection consistent with its source
- [ ] <!--e8-t04--> Vector index: the committed index definition, `scripts/create-vector-index.js`, and setup notes in `DEPLOY.md` for both the development and production databases · AC-E8.2 · repo: BE · learn: approximate nearest-neighbour search; cosine similarity; filter fields in a vector index
- [ ] <!--e8-t05--> Retrieval: `vectorQuery.js` (pure pipeline builder) and `searchSavedJobs.js`, grouping by job; tests that assert the user filter is inside the `$vectorSearch` stage on every path · AC-E8.4 · repo: BE · learn: why a pre-filter and a post-filter are not the same; testing a security property directly
- [ ] <!--e8-t06--> Backfill: `scripts/index-pending-jobs.js` with `--dry-run`, also re-indexing when the embedding model changes · AC-E8.3 · repo: BE · learn: idempotent batch jobs; re-indexing after a model change
- [ ] <!--e8-t07--> Tool use in chat: the `search_saved_jobs` tool definition, the bounded tool loop in `createReply`, results fenced as data, `sources` recorded on the message; tests with the model and search mocked · AC-E8.6, AC-E8.9 · repo: BE · learn: tool use; letting the model decide when to retrieve; bounding an agent loop
- [ ] <!--e8-t08--> Grounding rules: system-prompt rules for citing jobs, admitting when nothing was found, and the no-saved-jobs case; checked by hand on real questions before `e6-t10` measures them · AC-E8.6, AC-E8.7 · repo: BE · learn: grounding and abstention; why "I found nothing" is a correct answer
- [ ] <!--e8-t09--> `summarise_saved_jobs`: the aggregation, the tool definition, tests on a fixed set of jobs · AC-E8.8 · repo: BE · learn: when not to use RAG; aggregation pipelines
- [ ] <!--e8-t10--> Frontend source chips: read `sources` from the message, render chips linking to job details · AC-E8.10 · repo: FE · learn: showing provenance so users can check an answer

## Concepts

**RAG (retrieval-augmented generation).** Before answering, look up the
relevant passages and put them in front of the model. The model answers
from what it was given rather than from memory. First met in `e8-t07`.

**Chunking.** Splitting documents into passages small enough that one
passage is about one thing, but large enough to make sense alone. Too small
and a requirement loses its context; too big and one chunk matches
everything vaguely. First met in `e8-t01`.

**Embedding.** A list of numbers representing what a piece of text means.
Texts about similar things have similar numbers, so "React experience" and
"5+ years building SPAs in React" land close together even with few words
in common. First met in `e8-t02`.

**Vector search.** Finding the stored embeddings closest to a query's
embedding. Exact search compares against everything; a vector index finds
approximately the closest, much faster. First met in `e8-t04`.

**Pre-filter vs post-filter.** Filtering inside the search picks the top k
from the user's own chunks. Filtering after picks the top k from everyone's
and throws most away — slower, worse results, and the wrong data was touched.
First met in `e8-t05`.

**Tool use.** The model is told what tools exist; instead of answering, it
can ask for one to be run. The server runs it, returns the result, and the
model continues. Letting the model decide when to search is sometimes called
agentic RAG. First met in `e8-t07`.

**Grounding and abstention.** A grounded answer can point to where each
claim came from. Abstention is saying "the saved jobs don't say" when they
don't — a correct answer, not a failure. First met in `e8-t08`.

**When not to use RAG.** Retrieval returns the few most similar passages.
It cannot count, rank or total across all documents. Those questions need a
database query. First met in `e8-t09`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Local MongoDB has no `$vectorSearch` | See Open questions; unit tests never need it |
| Retrieval returns near-duplicates from one long ad | Results are grouped by job before reaching the model |
| The model cites a job it did not retrieve | `sources` come from the tool results, not the reply text; `e6-t10` measures citation accuracy |
| Embedding costs grow with users | One embedding per chunk on save; 200-job limit per user |

## Open questions

- [ ] **Q:** Where does RAG development run? `$vectorSearch` needs Atlas (or
      a local MongoDB with the separate search process). Proposed: a
      `careermate_dev` database on the existing free Atlas cluster, used
      only while working on this epic; local MongoDB stays the default.
      **A:** _(unanswered)_
- [ ] **Q:** Which Voyage AI model? Decided in `e8-t02` by checking current
      models and prices; proposed default: their general-purpose "lite"
      model, upgraded only if the `retrieval` eval says so.
      **A:** _(unanswered)_

## Test plan

- Chunker, pipeline builder, grouping, tool loop bound and aggregation are
  pure or mockable, and are unit-tested in `npm test`.
- The isolation property (AC-E8.4) has its own test per search path.
- Retrieval quality is measured by `e6-t09`; answer faithfulness by `e6-t10`.

## Interview notes

<!-- One line per merged task. -->
