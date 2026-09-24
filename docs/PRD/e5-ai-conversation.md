---
title: E5 — AI conversation
status: in-progress
epic: E5
owner: GeneCLee6
depends_on: [e3-t01, e4-t01]
---

## Background

The assistant is the product. A user asks about their job search — their
resume, an interview, a career move — and gets advice that already knows
their profile (E3) and their resume (E4). Conversations persist, can carry
images and PDFs, can be dictated, and can be deleted.

## Goals

- A chat that knows the user, and remembers the conversation.
- Attachments and dictation, so a user can show a job ad or just talk.
- Honest failure: a failed reply leaves no orphaned question, and a missing
  AI key is reported, not hidden.
- Users can delete what they said.

## Non-goals

- No retrieval over documents other than the resume — that is version 2
  (E8).

## Requirements

### Functional

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/chat/status` | Report whether the server has an AI key |
| `GET /v1/chat/conversations` | List the user's conversations |
| `GET /v1/chat/conversations/:id/messages` | Read one conversation |
| `POST /v1/chat/messages` | Send a message, with up to 3 attachments, creating a conversation |
| `POST /v1/chat/conversations/:id/messages` | Continue an existing conversation |
| `DELETE /v1/chat/conversations/:id` | Delete a conversation and its messages |
| `DELETE /v1/chat/conversations` | Delete every conversation the user has |

- The system prompt carries the user's name, role, field, goal and the text
  of their resumes (E3, E4). The last 40 messages are replayed as history.
- With no `ANTHROPIC_API_KEY`: the service still starts, `/chat/status`
  reports `configured: false`, and sending returns 503.
- If the reply fails, the user's message is rolled back. A conversation
  never contains a question with no answer.
- A message may carry up to 3 attachments, 5 MB each. Images are read by the
  model directly; PDFs are turned into text by the resume extractor. A
  message that is only an attachment is valid.
- Attachment bytes are **never stored** — only a filename and type, so a
  reloaded transcript still shows what was sent. Replayed turns tell the
  model the file is no longer available.
- Dictation uses the browser's speech recognition, offers the languages the
  browser and OS report, and shows live text while speaking.

### Non-functional

- Model and parameters are recorded in `ARCHITECTURE.md` §5 and `AI.md`.
- Tests never call the Anthropic API.

## Design

`src/chat/` — `claude.service.js` builds the request and maps SDK errors,
`attachments.js` turns uploads into content blocks, `chat.controller.js`
owns persistence and rollback. Frontend `src/pages/Chat`,
`src/hooks/useSpeechRecognition.ts`.

## Acceptance criteria

**As a user, I want to ask the assistant about my job search and get a
useful answer.**

- [x] **AC-E5.1** — Given a message, when I send it, then my message and the
  reply are both persisted and returned together.
- [x] **AC-E5.2** — Given the model call fails, then my message is removed and
  the error names the real cause.
- [x] **AC-E5.3** — Given no API key is configured, then `/chat/status`
  reports `configured: false`, the UI says the assistant is unavailable, and
  sending returns 503 — the server still starts.
- [x] **AC-E5.4** — Given the model refuses to answer, then that is surfaced as
  a refusal rather than as a transport error (the API returns HTTP 200 for a
  refusal).
- [x] **AC-E5.5** — Given an image or PDF attached to a message, then the
  assistant reads it; given more than 3 files or one over 5 MB, then I get
  400; given a reloaded conversation, then the attachment's name is shown
  and its bytes were never stored.
- [x] **AC-E5.6** — Given I dictate, then I can choose among my browser's
  languages and see the text as I speak.

**As a user, I want my conversations to still be there tomorrow.**

- [x] **AC-E5.7** — Given a conversation created yesterday, when I list
  conversations, then it appears, ordered by most recent activity, and I
  can open it.
- [x] **AC-E5.8** — Given another user's conversation id, then I get 404.

**As a user, I want to delete what I said.**

- [x] **AC-E5.9** — Given a conversation of mine, when I delete it, then it
  and its messages are gone; when I delete all history, then every
  conversation is gone, including ones the assistant screen does not open.

**As a user, I want long answers to appear as they are written.**

- [ ] **AC-E5.10** — Given a long reply, then its text starts appearing within
  a few seconds instead of all at once at the end.
- [ ] **AC-E5.11** — Given I have sent a message and no text has arrived yet,
  then an animated indicator shows the assistant is working, and after a
  few seconds it also shows how long I have been waiting; with reduced
  motion turned on in my system, the indicator does not animate.
- [ ] **AC-E5.12** — Given the model is thinking before it answers, then I see
  a short summary of what it is working on, which gives way to the answer
  when the answer starts.
- [ ] **AC-E5.13** — Given the stream fails part-way, then the partial reply
  disappears, my message is rolled back as it is today, and the error is
  shown; given I leave the page mid-reply, then the model call is
  cancelled.
- [ ] **AC-E5.14** — Given a streamed reply, when I reload the conversation,
  then the stored reply is exactly what was shown.

## Tasks

- [x] <!--e5-t01--> Chat API: conversations, messages, Claude call, rollback on failure, status endpoint, refusal handling, first backend tests · AC-E5.1–AC-E5.4, AC-E5.8 · repo: BE · done in: BE#1 · learn: the Messages API; system prompt vs history; mapping typed SDK errors
- [x] <!--e5-t02--> Chat screen connected to the API · AC-E5.1, AC-E5.2 · repo: FE · done in: FE#9 · learn: request/response chat UI; pending and error states
- [x] <!--e5-t03--> Images and PDFs on a message: content blocks, limits, bytes never stored · AC-E5.5 · repo: BE · done in: BE#16 · learn: vision content blocks; not storing what you do not need
- [x] <!--e5-t04--> Composer attachment and microphone buttons · AC-E5.5, AC-E5.6 · repo: FE · done in: FE#16 · learn: the Web Speech API
- [x] <!--e5-t05--> Usable dictation: browser languages, live text, no cut-offs · AC-E5.6 · repo: FE · done in: FE#17, FE#20 · learn: `navigator.languages`, `Intl.DisplayNames`, continuous recognition
- [x] <!--e5-t06--> Delete one conversation or all history · AC-E5.9 · repo: BE, FE · done in: BE#18, FE#19 · learn: a right to delete; why bulk delete matters when the UI shows only the latest conversation
- [x] <!--e5-t07--> Conversation list, loading state and AI status in the UI · AC-E5.3, AC-E5.7 · repo: FE · done in: FE#23 · learn: telling the user what the system is doing
- [ ] <!--e5-t08--> Streaming endpoint: server-sent events for sending and continuing a conversation, using the SDK's message stream with thinking shown as `summarized`; events for thinking summary, text, done (with the stored message ids) and error; the reply stored only once complete; rollback on failure; the model call aborted when the client disconnects; checked on Render that nothing buffers the stream · AC-E5.10, AC-E5.12, AC-E5.13, AC-E5.14 · repo: BE · learn: what streaming does and does not change (time to first token, not total time or cost); server-sent events; handling a failure after output has started
- [ ] <!--e5-t09--> Waiting indicator: three animated dots in the assistant bubble, an elapsed-seconds counter after five seconds, no animation under `prefers-reduced-motion` · AC-E5.11 · repo: FE · learn: perceived latency; CSS keyframes; accessible motion
- [ ] <!--e5-t10--> Streaming in the chat screen: read the event stream with `fetch` (EventSource cannot send a POST with an auth header), render text as it arrives, show the thinking summary until the answer starts, remove a partial reply on error, abort on leaving the page · AC-E5.10, AC-E5.12, AC-E5.13 · repo: FE · learn: `ReadableStream` and parsing server-sent events by hand; `AbortController`

## Concepts

**System prompt vs history.** The system prompt holds what is always true
(who the user is, their resume); the message history holds what was said.
Keeping them apart keeps each request small and the instructions stable.
First met in `e5-t01`.

**Refusals are not errors.** The API reports a refusal inside a successful
response. Treating it as an error would show "something went wrong" when
the model in fact answered. First met in `e5-t01`.

**Streaming.** The model writes its answer token by token either way.
Streaming sends each piece as it is written instead of waiting for the
end, so the first words appear in about a second rather than after the
whole reply. The total time, the tokens and the cost are unchanged — it
improves perceived speed, not actual speed. Streaming is for when a person
is watching; background work (evals, extraction, backfills) does not
stream. First met in `e5-t08`.

**Rollback.** Saving the user's message and then failing to get a reply
would leave a question with no answer. The message is removed if the reply
fails, so the transcript is always consistent. First met in `e5-t01`.

## Closed gaps

- Another user's conversation answered 403, which confirms the id exists.
  Now 404.

## Test plan

`claude.service` tests (with and without a key) cover request building,
error mapping and refusals; `attachments` tests cover limits and block
building. Chat was verified end to end against the real API, locally and in
production.

## Interview notes

- Built a resume-aware Claude chat with image and PDF attachments that are
  never stored, consistent rollback when a reply fails, and an honest
  "unavailable" state when the server has no key.
