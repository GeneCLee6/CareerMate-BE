# CareerMate AI — Assistant Design

How the AI side of the product is built, and why it is built this way.
`ARCHITECTURE.md` §5 is the short version; this is the reasoning.

## 1. What this is — and what it deliberately is not

There are three ways to build on top of a language model, and they are not
tiers of quality — they are different tools:

| Shape | The model decides | You write |
| --- | --- | --- |
| **Single call** | What to say | One request, one response |
| **Workflow** | What to say at each step | The steps, and the control flow between them |
| **Agent** | What to *do*, and when to stop | Tools, and a loop that keeps calling until the model is finished |

**CareerMate is a single call.** There is no loop, no tool use, and no
autonomy. Each turn is one `POST /v1/messages` with the conversation so far,
and the reply is stored and returned.

That is worth stating plainly, because "chat agent" is often used loosely. An
agent is defined by the model being able to *act* — call a tool, observe the
result, decide what to do next. CareerMate's model cannot do anything except
produce text. Everything it knows arrives in the prompt, assembled by the
server before the call.

**Why that is the right shape here.** The product's job is to give careers
advice in conversation. There is no external system to act on: no calendar to
book, no job board to query, no file to write. Adding an agent loop would add
non-determinism, latency and cost to solve a problem the product does not
have. The moment that changes — searching real job listings, reading an
uploaded resume, drafting and saving a document — the case for tools becomes
real, and §8 covers what that would look like.

The interesting engineering here is not the loop we did not build. It is
**context assembly** and **failure behaviour**.

## 2. The request path

```
POST /v1/chat/messages
  │
  ├─ authGuard          verify the token, confirm the account is still live
  ├─ validateBody       content: 1–4000 characters
  │
  └─ chat.controller
       ├─ find or create the Conversation
       ├─ persist the user's Message            ← written before the model call
       │
       ├─ assemble context, in parallel:
       │    ├─ User      name, role, field, goal
       │    ├─ Resume    the 5 most recent filenames
       │    └─ Message   the last 40 turns, oldest first
       │
       ├─ claude.service.createReply()
       │    ├─ buildSystemPrompt(user, resumes)
       │    ├─ anthropic.beta.messages.create(...)
       │    └─ map failures onto this project's exceptions
       │
       ├─ on failure: delete the user Message, and the Conversation if it
       │              was created by this request  ← see §6
       │
       └─ persist the assistant Message + token usage, bump lastMessageAt
```

Two properties fall out of this shape:

- **Conversation state lives in MongoDB, not in the model.** The Messages API
  is stateless; every turn resends the history. That is why a refresh loses
  nothing, and why the history window in §4 is a cost decision rather than a
  technical limit.
- **The controller orchestrates; the service talks to the vendor.** Nothing
  outside `claude.service.js` imports the Anthropic SDK, which is why the
  tests can mock one module and cover the whole error surface without a key
  (`RULES.md` §1.5).

## 3. The system prompt

Two parts: a fixed instruction block, and facts about this user.

```js
BASE_PROMPT
  "You are CareerMate AI, a careers assistant for students and early-career
   engineers... Be specific and practical. Prefer concrete examples and short,
   scannable answers over long essays. When you do not know something about
   the user, ask rather than assuming. If a question falls outside careers,
   say so briefly and steer back."

What you know about this user:
- Name: ...
- Role: Student | Other
- Field: Frontend Development | Backend Development
- Stated goal: ...
- Resumes on file: cv.pdf. You cannot read their contents yet, so ask the
  user to paste the relevant section when it matters.
```

Four decisions in there:

**Profile fields are model input, not just profile data.** `role`, `field` and
`goal` are collected during onboarding and interpolated here, so the
assistant does not open every conversation by asking what the user already
told the product. This is why `PRD.md` §3.2 says those fields are not only
profile data — changing the onboarding enum changes what the model sees.

**The resume limitation is stated, not hidden.** The model is told the files
exist, given their names, and told it cannot read them. Without that line a
model asked "what do you think of my resume?" will happily produce plausible
feedback about a document it has never seen. Naming the limitation converts a
confident fabrication into "paste the section you want me to look at" — the
single highest-value line in the prompt, and the thing §8 item 1 removes.

**Empty facts are omitted, not sent as empty.** A user who skipped onboarding
gets `BASE_PROMPT` alone rather than `Role: undefined`. Null-ish values in a
prompt are noise the model tries to interpret.

**Length is bounded.** `goal` is capped at 500 characters and `fullName` at
100 (`utils/limits.js`). An unbounded profile field is an unbounded prompt:
tokens paid for on every turn of every conversation, and room to push the
real instructions out of the model's attention.

## 4. History: the last 40 turns

Every turn resends the conversation. `HISTORY_LIMIT = 40` messages, oldest
first, with anything older dropped.

Dropping rather than summarising is deliberate. Summarisation means a second
model call, a place to store the summary, and a new failure mode where the
summary is wrong and the user cannot see why the assistant is confused. Forty
turns is far more than a careers conversation runs to in practice, so the
limit exists to bound cost in the pathological case, not to manage a real
constraint. If conversations ever get long enough for this to bite, the fix is
summarisation at the boundary — and it should be built then, with real
transcripts to test against.

## 5. Model and parameters

```js
model:         "claude-opus-5"
max_tokens:    16000
thinking:      { type: "adaptive" }
output_config: { effort: "medium" }
betas:         ["server-side-fallback-2026-07-01"]
fallbacks:     "default"
```

| Choice | Reasoning |
| --- | --- |
| `claude-opus-5` | Advice quality is the product. A cheaper model shows up directly as worse advice, which is the one thing this product cannot afford |
| `thinking: adaptive` | The model decides how much to think per turn. "Fix this bullet point" and "plan a career change" do not deserve the same budget, and adaptive means we do not have to guess per request |
| `effort: "medium"` | The tuning lever, and the one to reach for before changing model. Careers chat is conversational rather than a hard reasoning problem. Raise it if answers start feeling shallow |
| `max_tokens: 16000` | A **ceiling, not a target**. Unused output tokens are not billed; this only stops a long answer being truncated mid-sentence |
| `fallbacks: "default"` | If the primary model declines on policy grounds, a backup answers within the same call, so a borderline question does not become a dead end |

**`effort` before model choice.** If cost needs to come down, lowering effort
degrades gracefully — answers get more direct. Downgrading the model changes
the product. The comment in `claude.service.js` says not to swap the model for
cost without asking, and this is why.

## 6. Failure behaviour

This is where most of the design effort went, because a careers assistant
that fails opaquely is worse than one that is occasionally unavailable.

### A refusal is HTTP 200

When the model declines, the API returns **200** with
`stop_reason === "refusal"` — not an error status. Reading `content` without
checking first yields an empty string, and the user sees a blank reply from a
system that looks like it worked.

So the refusal branch is explicit, logs the category, and returns a written
answer that points back at what the assistant is for:

> "I can't help with that one. Ask me about your resume, interviews, or
> career planning and I'll do my best."

### Errors are matched on type, never on message text

```
AuthenticationError  → 503  "not configured correctly"   (our problem, not the user's)
RateLimitError       → 429  "busy right now"             (worth retrying)
BadRequestError      → 400  "that message could not be sent"
APIError             → 502  "unavailable, please try again"
anything else        → rethrown untouched
```

Matching on `error.message` would break silently the first time a vendor
reworded something. The mapping also decides *whose* problem each failure is:
a missing key is a 503 because the server is misconfigured, while a rate limit
is a 429 because waiting will fix it.

### A failed turn leaves no orphan

If the model call throws, the controller deletes the user's message — and the
conversation too, if this request created it:

```js
} catch (error) {
    await Message.deleteOne({ _id: userMessage._id });
    if (!req.params.id) {
        await Conversation.deleteOne({ _id: conversation._id });
    }
    throw error;
}
```

The message is written before the call so that a crash mid-request cannot lose
what the user typed; the rollback exists so a transcript never contains a
question with no answer. The frontend completes the picture: it removes the
pending message and puts the text back in the input, so a retry is one click
rather than retyping.

### No key is a supported state, not a crash

`ANTHROPIC_API_KEY` is optional. Without it the server still boots,
`GET /v1/chat/status` reports `configured: false`, and sending a message
returns 503. A contributor can run the whole product — sign up, verify,
upload, browse — without an Anthropic account, and the one feature that needs
a key is the only one that stops working. The client is built lazily inside
`getClient()` specifically so the absence of a key is discovered at call time
rather than at import time.

## 7. Cost, security and privacy

**Cost.** `usage` is stored on every assistant message — input tokens, output
tokens, and the model that actually answered. A one-line question measured
**163 input / 77 output tokens**, so the input cost is dominated by the system
prompt and history rather than by what the user types. That is the honest
reason the profile fields are length-capped and the history window is bounded:
both are multiplied by every turn. Because usage is stored per message, actual
spend is a database query rather than a guess.

**Tests never call the API.** `claude.service.test.js` mocks the SDK, so the
entire error mapping — including the refusal branch — is covered with no key
and no spend. CI runs it on every PR for free.

**Prompt injection is a live surface, and a bounded one.** Everything in the
system prompt is user-controlled: name, goal, and resume filenames. A user
could name a file `ignore previous instructions.pdf`. Today the blast radius
is small — the model has no tools, so the worst outcome is that it misbehaves
in that user's own conversation. There is no other user's data to reach and no
action to take. **That changes the moment tools are added** (§8), which is why
tool use and untrusted prompt content should not land in the same change.

**No secrets reach the model.** The prompt carries profile fields and
filenames — never tokens, password hashes, or anything from `.env`. Resume
files themselves stay in S3; only their names are sent.

## 8. What is missing, and what would change the shape

In priority order. Item 1 is the product's biggest gap; items 3 and 4 are what
would turn this from a single call into a genuine agent.

**1. The assistant cannot read resumes.** It knows filenames. For a product
whose headline promise is resume feedback, this is the gap that matters most.
The path: extract text from the PDF on upload, store it alongside the record,
and include the relevant part in the prompt. Once resumes are long enough that
they do not fit comfortably, selecting the relevant section becomes a
retrieval problem rather than a formatting one.

**2. Replies do not stream.** A long answer arrives all at once after a
visible wait. The API supports streaming; this needs SSE on the backend and
incremental rendering on the frontend. Note the interaction with hosting
(`DEPLOY.md` §3): streaming makes the execution-limit problem worse, not
better, which reinforces the choice of a long-lived container over serverless.

**3. Tool use, when there is something to act on.** Searching real job
listings, or drafting and saving a document, is the point at which the model
needs to *do* something and the single call becomes a loop. The SDK's tool
runner would own that loop.

**4. Evaluation.** There is no measurement of answer quality — only that a
reply came back. Before tuning `effort` or changing model on anything but
instinct, there should be a set of representative questions and a way to
compare outputs across configurations. Right now "raise effort if answers feel
shallow" is a judgement call, and it should be a measurement.

## 9. Alternatives considered

| Option | Why not |
| --- | --- |
| An agent loop with tools from the start | Nothing to act on. Non-determinism, latency and cost for no user-visible gain |
| A cheaper model | Advice quality *is* the product. `effort` is the cost lever that degrades gracefully; model choice is not |
| Fixed `budget_tokens` instead of adaptive thinking | Guessing a budget per request when the model can decide per turn. Also deprecated on current models |
| Conversation summarisation | A second call, another thing to store, and a failure mode the user cannot see — before any real conversation is long enough to need it |
| Streaming from day one | Worth doing (§8), but it complicates the error path, and getting persistence and rollback right mattered more first |
| Sending resume text before extraction was solid | Half-parsed PDF text is worse than a stated limitation: the model produces confident feedback on garbled input |
