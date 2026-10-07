const { loadCases } = require("./dataset");
const { judgeContent, judgeReview, scoreJudgement, SCHEMA } = require("./judge");
const { CONFIGS } = require("./request");

const testCase = loadCases().find((c) => c.id === "r01");
const verdict = (issues, extra = {}) => ({
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ issues, unsupportedClaims: [], specificity: 4, ...extra }) }],
});

describe("resume-review judge", () => {
    it("gives the judge the resume, every planted problem and the review", () => {
        const content = judgeContent(testCase, "Add numbers to your bullets.");
        expect(content).toContain(testCase.resumeText.slice(0, 40));
        for (const p of testCase.plantedIssues) expect(content).toContain(`<problem id="${p.issue}">`);
        expect(content).toContain("<review>\nAdd numbers to your bullets.\n</review>");
    });

    it("never tells the judge which configuration wrote the review", () => {
        const request = JSON.stringify(judgeReview(testCase, "A review."));
        for (const name of Object.keys(CONFIGS)) expect(request).not.toContain(name);
        expect(request).not.toMatch(/effort.{0,5}medium|resumeInput/);
    });

    it("uses Sonnet 5 at high effort, with structured output", () => {
        const request = judgeReview(testCase, "A review.");
        expect(request.model).toBe("claude-sonnet-5");
        expect(request.output_config).toEqual({ effort: "high", format: { type: "json_schema", schema: SCHEMA } });
    });

    it("turns a verdict into recall, unsupported claims and specificity", () => {
        const [first, ...rest] = testCase.plantedIssues;
        const issues = [
            { id: first.issue, found: true, evidence: "x" },
            ...rest.map((p) => ({ id: p.issue, found: false, evidence: "" })),
        ];
        const { scores } = scoreJudgement(
            verdict(issues, { unsupportedClaims: [{ claim: "no GitHub", why: "it is listed" }] }),
            testCase,
        );
        expect(scores).toEqual({
            issueRecall: 1 / testCase.plantedIssues.length,
            unsupportedClaims: 1,
            specificity: 4,
        });
    });

    it("refuses a verdict that does not cover exactly the planted problems", () => {
        const issues = [{ id: "too-long", found: true, evidence: "" }];
        expect(() => scoreJudgement(verdict(issues), testCase)).toThrow(/planted problems are/);
    });

    it("refuses a verdict cut off before it finished", () => {
        expect(() => scoreJudgement({ stop_reason: "max_tokens", content: [] }, testCase)).toThrow(/max_tokens/);
    });
});
