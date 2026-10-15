const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ISSUES } = require("./taxonomy");
const { JUDGE_MODEL, judgeRequest, parseJudgement } = require("../graders/llmJudge");
const { reviewQuestion } = require("./request");

const RUBRIC = fs.readFileSync(path.join(__dirname, "rubric.md"), "utf-8");
const issueById = Object.fromEntries(ISSUES.map((i) => [i.id, i]));

/**
 * The verdict's shape for one case. `issues` has a required property for each
 * problem planted in this case and no other, so the judge cannot grade a
 * problem that is not there or skip one that is — the structure enforces it,
 * rather than the prompt asking for it.
 */
function schemaFor(testCase) {
    const verdict = {
        type: "object",
        properties: { found: { type: "boolean" }, evidence: { type: "string" } },
        required: ["found", "evidence"],
        additionalProperties: false,
    };
    const ids = testCase.plantedIssues.map((p) => p.issue);
    return {
        type: "object",
        properties: {
            issues: {
                type: "object",
                properties: Object.fromEntries(ids.map((id) => [id, verdict])),
                required: ids,
                additionalProperties: false,
            },
            unsupportedClaims: {
                type: "array",
                items: {
                    type: "object",
                    properties: { claim: { type: "string" }, why: { type: "string" } },
                    required: ["claim", "why"],
                    additionalProperties: false,
                },
            },
            specificity: { type: "integer", enum: [1, 2, 3, 4, 5] },
        },
        required: ["issues", "unsupportedClaims", "specificity"],
        additionalProperties: false,
    };
}

/**
 * What the judge reads: the resume, what was planted in it, what the user
 * asked, and the review. The question is the same in every configuration;
 * the configuration that produced the review is deliberately absent.
 */
function judgeContent(testCase, reviewText) {
    const planted = testCase.plantedIssues
        .map((p) => {
            const issue = issueById[p.issue];
            return [
                `<problem id="${p.issue}">`,
                `Name: ${issue.name}`,
                `Definition: ${issue.definition}`,
                `Does not count: ${issue.doesNotCount}`,
                `Where in the resume: ${p.where}`,
                ...(p.evidence ? [`Shows as: ${p.evidence}`] : []),
                "</problem>",
            ].join("\n");
        })
        .join("\n\n");

    return [
        "<resume>",
        testCase.resumeText,
        "</resume>",
        "",
        "<planted_problems>",
        planted,
        "</planted_problems>",
        "",
        "<question>",
        reviewQuestion(testCase),
        "</question>",
        "",
        "<review>",
        reviewText,
        "</review>",
        "",
        "Grade the review against the rubric. In `issues`, give a verdict for each planted problem, keyed by its id.",
    ].join("\n");
}

function judgeReview(testCase, reviewText) {
    return judgeRequest({ rubric: RUBRIC, content: judgeContent(testCase, reviewText), schema: schemaFor(testCase) });
}

/**
 * Turns the judge's verdict into the eval's metrics. The judge must give a
 * verdict on exactly the planted problems; anything else is an error rather
 * than a silently wrong score.
 */
function scoreJudgement(message, testCase) {
    const verdict = parseJudgement(message);
    const judgement = {
        ...verdict,
        issues: Object.entries(verdict.issues).map(([id, v]) => ({ id, ...v })),
    };
    const planted = testCase.plantedIssues.map((p) => p.issue).sort();
    const judged = judgement.issues.map((i) => i.id).sort();
    if (planted.join(",") !== judged.join(",")) {
        throw new Error(`judge graded [${judged}] but the planted problems are [${planted}]`);
    }
    const found = judgement.issues.filter((i) => i.found).length;
    return {
        scores: {
            issueRecall: found / planted.length,
            unsupportedClaims: judgement.unsupportedClaims.length,
            specificity: judgement.specificity,
        },
        judgement,
    };
}

/**
 * Identifies this judge: its model, rubric, schema and prompt. A check
 * against hand labels holds for this fingerprint only; change any of them
 * and the judge must be checked again. Line endings are normalised so the
 * fingerprint is the same on every machine.
 */
const JUDGE_FINGERPRINT = crypto
    .createHash("sha256")
    .update(
        [JUDGE_MODEL, RUBRIC, schemaFor, judgeContent, reviewQuestion, judgeRequest]
            .map(String)
            .join("\n")
            .replace(/\r\n/g, "\n"),
    )
    .digest("hex")
    .slice(0, 12);

module.exports = { RUBRIC, JUDGE_FINGERPRINT, schemaFor, judgeContent, judgeReview, scoreJudgement };
