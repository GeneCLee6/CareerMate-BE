const fs = require("fs");
const path = require("path");
const { ISSUES } = require("./taxonomy");
const { judgeRequest, parseJudgement } = require("../graders/llmJudge");

const RUBRIC = fs.readFileSync(path.join(__dirname, "rubric.md"), "utf-8");
const issueById = Object.fromEntries(ISSUES.map((i) => [i.id, i]));

const SCHEMA = {
    type: "object",
    properties: {
        issues: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    id: { type: "string", enum: ISSUES.map((i) => i.id) },
                    found: { type: "boolean" },
                    evidence: { type: "string" },
                },
                required: ["id", "found", "evidence"],
                additionalProperties: false,
            },
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

/**
 * What the judge reads: the resume, what was planted in it, and the review.
 * The configuration that produced the review is deliberately absent.
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
        "<review>",
        reviewText,
        "</review>",
        "",
        "Grade the review against the rubric. Give one entry in `issues` for each planted problem, in the order listed.",
    ].join("\n");
}

function judgeReview(testCase, reviewText) {
    return judgeRequest({ rubric: RUBRIC, content: judgeContent(testCase, reviewText), schema: SCHEMA });
}

/**
 * Turns the judge's verdict into the eval's metrics. The judge must give a
 * verdict on exactly the planted problems; anything else is an error rather
 * than a silently wrong score.
 */
function scoreJudgement(message, testCase) {
    const judgement = parseJudgement(message);
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

module.exports = { RUBRIC, SCHEMA, judgeContent, judgeReview, scoreJudgement };
