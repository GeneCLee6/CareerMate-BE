/**
 * Shared plumbing for an LLM judge: a request that returns structured output
 * against a JSON schema, and the parsing of that output.
 *
 * Each eval supplies its own rubric, content and schema. Nothing here knows
 * which configuration produced the output being judged — callers keep the
 * judge blind by not passing it.
 */

/** Cheaper than the model under test, and must earn trust (AC-E6.5). */
const JUDGE_MODEL = "claude-sonnet-5";

function judgeRequest({ rubric, content, schema, maxTokens = 8000 }) {
    return {
        model: JUDGE_MODEL,
        max_tokens: maxTokens,
        thinking: { type: "adaptive" },
        output_config: {
            // Grading must be careful; batching makes the wait irrelevant.
            effort: "high",
            format: { type: "json_schema", schema },
        },
        system: rubric,
        messages: [{ role: "user", content }],
    };
}

/** The judge's structured output, or an error saying why there is none. */
function parseJudgement(message) {
    if (message.stop_reason !== "end_turn") {
        throw new Error(`judge stopped with ${message.stop_reason}`);
    }
    const text = message.content.find((b) => b.type === "text")?.text;
    if (!text) throw new Error("judge returned no text");
    return JSON.parse(text);
}

module.exports = { JUDGE_MODEL, judgeRequest, parseJudgement };
