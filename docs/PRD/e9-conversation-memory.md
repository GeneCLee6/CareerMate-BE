---
title: E9 — Conversation memory
status: idea          # not planned in detail until E8 is done
epic: E9
owner: GeneCLee6
depends_on: [e6-t08]  # needs the eval harness to measure summary quality
---

## Background

The owner's instinct is that CareerMate needs only one conversation: every
question is about the same person's job search. Today that would not work
well. The assistant has no memory of its own; each message resends the
conversation, capped at the last 40 messages, so one endless conversation
would grow expensive and would silently forget its oldest — often most
important — context ("I need visa sponsorship"). Version 1 therefore keeps
separate conversations (see `e5-ai-conversation.md`, Concepts).

This epic is the alternative: **one continuous conversation**, where older
messages are condensed into a running summary that is sent instead of the
full transcript.

## Goals

- A single conversation, with no list to manage.
- The assistant keeps the facts that matter — goals, constraints,
  applications in progress — however long the conversation gets.
- The cost of a message stays roughly flat as the conversation grows.

## Non-goals

- To be decided when the epic is planned.

## Open questions

- [ ] **Q:** When is a summary made — every N messages, or when the history
      passes a token size? Server-side compaction in the API, or our own
      summary call?
      **A:** _(unanswered)_
- [ ] **Q:** How is summary quality measured? Proposed: an eval that plants
      facts early in a long synthetic conversation and checks the assistant
      still uses them at the end.
      **A:** _(unanswered)_
- [ ] **Q:** What does "delete my history" mean when the summary still
      carries facts from deleted messages?
      **A:** _(unanswered)_

## Concepts

**Context management.** Deciding what the model sees on each request:
everything, the most recent part, or a summary of the older part plus the
recent part. It sets both the quality of the answer and the cost of the
request.
