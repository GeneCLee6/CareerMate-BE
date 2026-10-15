/**
 * The resume-review eval: which configuration of the assistant reviews a
 * resume best, and at what cost?
 *
 * Each reviewed case is sent through the product's own request builder
 * (request.js) under each configuration, and the review is graded blind by
 * an LLM judge against rubric.md (judge.js): how many planted problems it
 * found, how many things it claimed about the resume that are not true, and
 * how specific it was.
 *
 *     npm run eval:resume-review -- --configs medium-text,high-text   # stage 1
 *
 * The judge's scores count only once it agrees with the owner's hand labels:
 * each run prints the last check and is marked not valid without one (see
 * label.js and agreement.js).
 */
const { loadCases } = require("./dataset");
const { CONFIGS, reviewRequest } = require("./request");
const { judgeReview, scoreJudgement, JUDGE_FINGERPRINT } = require("./judge");
const { judgeValidity, describeValidity } = require("./agreement");
const { JUDGE_MODEL } = require("../graders/llmJudge");
const { extractText, MODEL } = require("../../src/chat/claude.service");

module.exports = {
    description: "Which assistant configuration reviews a resume best, judged blind.",

    // Only cases a person has reviewed are used.
    loadCases: () => loadCases({ reviewedOnly: true }),

    configs: CONFIGS,

    request: (testCase, config) => reviewRequest(testCase, config),

    parse: (message) => {
        if (message.stop_reason === "refusal") {
            throw new Error("the assistant declined to review this resume");
        }
        const text = extractText(message.content);
        if (!text) throw new Error("the assistant returned no text");
        return text;
    },

    // Generous guesses for the budget check. A PDF costs two to four times the
    // tokens of its extracted text; thinking adds to the output.
    estimate: (testCase, config) => ({
        model: MODEL,
        input_tokens: config.resumeInput === "pdf" ? 9000 : 2500,
        output_tokens: config.effort === "high" ? 4000 : 2500,
    }),

    judge: (testCase, review) => judgeReview(testCase, review),

    scoreJudgement,

    judgeFingerprint: JUDGE_FINGERPRINT,
    judgeValidity: () => judgeValidity(JUDGE_FINGERPRINT),
    describeValidity,

    estimateJudge: (testCase) => ({
        model: JUDGE_MODEL,
        input_tokens: 2500 + Math.ceil(testCase.resumeText.length / 3),
        output_tokens: 3000,
    }),
};
