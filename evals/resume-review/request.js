const fs = require("fs");
const path = require("path");
const { buildRequest } = require("../../src/chat/claude.service");
const { CASES_DIR } = require("./dataset");

/**
 * The configurations the resume-review eval compares: how hard the model
 * thinks, and how the resume reaches it. Stage 1 is the two text configs;
 * stage 2 adds the PDF ones (see docs/PRD/e6-evals.md).
 */
const CONFIGS = {
    "medium-text": { effort: "medium", resumeInput: "text" },
    "high-text": { effort: "high", resumeInput: "text" },
    "medium-pdf": { effort: "medium", resumeInput: "pdf" },
    "high-pdf": { effort: "high", resumeInput: "pdf" },
};

/** What a user would ask on the assistant screen, given the case's applicant. */
function reviewQuestion(testCase) {
    const { targetRole, location } = testCase.persona;
    return `Please review my resume. I'm applying for ${targetRole} roles in ${location}. What should I fix first?`;
}

/**
 * Builds the request the product would send for this case, under this
 * configuration — by calling the product's own `buildRequest`, so the eval
 * measures the real prompt, history and model settings rather than a copy
 * that could drift from them. Only effort is overridden, because effort is
 * what the eval varies.
 *
 * In text mode the product's limits apply as they do for users, including
 * the cap on how much resume text reaches the prompt.
 */
function reviewRequest(testCase, config, { casesDir = CASES_DIR } = {}) {
    const resumes = [
        { fileName: testCase.pdfFile ?? `${testCase.id}.pdf`, textStatus: "ok", contentText: testCase.resumeText },
    ];
    const resumePdfs =
        config.resumeInput === "pdf"
            ? [
                  {
                      fileName: testCase.pdfFile,
                      data: fs.readFileSync(path.join(casesDir, testCase.pdfFile)).toString("base64"),
                  },
              ]
            : [];

    const request = buildRequest({
        // What onboarding would have told the product about this applicant.
        user: { goal: `${testCase.persona.targetRole} in ${testCase.persona.location}` },
        resumes,
        history: [{ role: "user", content: reviewQuestion(testCase) }],
        resumeInput: config.resumeInput,
        resumePdfs,
    });
    return { ...request, output_config: { ...request.output_config, effort: config.effort } };
}

module.exports = { CONFIGS, reviewQuestion, reviewRequest };
