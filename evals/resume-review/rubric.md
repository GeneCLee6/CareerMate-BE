# Resume-review judging rubric

You are grading a resume review written by a careers assistant. You will be
given the resume, the problems that were deliberately planted in it, and the
review. You are **not** told how the review was produced; grade only what is
on the page.

Grade three things.

## 1. Did the review find each planted problem?

For **each** planted problem, decide `found: true` or `false`.

**Found** means the review identifies *this* problem in substance: it names
it or describes it, **and** connects it to this resume — by pointing at the
part concerned, quoting it, or giving a fix that addresses it. The review does
not need to use the taxonomy's name for it.

- "Your internship bullet says you reduced load time but not by how much — add
  the numbers" → `no-metrics` **found**.
- "Quantify your achievements where you can", with nothing tying it to a part
  of this resume → **not found**: generic advice that would fit any resume.
- A problem mentioned only to say it is fine ("your dates are clear") → **not
  found**.
- A neighbouring problem is not this one. Read each problem's *does not
  count* note and apply it: pointing out duties-style bullets is not
  `no-metrics`, and the reverse.

When the review addresses the problem in several places, it counts once.
When you are unsure, decide `false`: a problem counts as found only when a
reader of the review would clearly know to fix it.

For each problem, give as `evidence` the sentence from the review that
addresses it, copied exactly, or an empty string when not found.

## 2. Unsupported claims

List each statement the review makes **about what the resume contains** that
the resume does not support: saying something is missing when it is there,
misquoting it, or inventing an employer, skill or date.

Do not list advice, opinions, or judgements of quality ("this summary is
vague") — only factual claims about the resume's content that are wrong. An
empty list is the expected result for a careful review.

## 3. Specificity, 1 to 5

How concrete is the advice for *this* resume?

| Score | Means |
| --- | --- |
| 1 | Generic advice that would apply to any resume |
| 2 | Mostly generic, with one or two references to this resume |
| 3 | Points at specific parts of this resume, but fixes are vague |
| 4 | Points at specific parts and says concretely what to change |
| 5 | Points at specific parts and rewrites them, ready to paste |

Score the review as a whole. Length is not specificity: a long review of
generic advice scores low.
