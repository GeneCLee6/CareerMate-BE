// config snapshots process.env when it loads; the product module needs it.
jest.mock("../../src/utils/config", () => ({
    ...jest.requireActual("../../src/utils/config"),
    ANTHROPIC_API_KEY: "sk-ant-test",
}));

const { loadCases } = require("./dataset");
const { CONFIGS, reviewRequest, reviewQuestion } = require("./request");
const { buildRequest, MODEL } = require("../../src/chat/claude.service");

const testCase = loadCases().find((c) => c.id === "r01");

describe("reviewRequest", () => {
    it("is the product's own request, with only effort changed", () => {
        const request = reviewRequest(testCase, CONFIGS["high-text"]);
        const product = buildRequest({
            user: { goal: `${testCase.persona.targetRole} in ${testCase.persona.location}` },
            resumes: [{ fileName: testCase.pdfFile, textStatus: "ok", contentText: testCase.resumeText }],
            history: [{ role: "user", content: reviewQuestion(testCase) }],
        });

        expect(request).toEqual({ ...product, output_config: { ...product.output_config, effort: "high" } });
        expect(request.model).toBe(MODEL);
        expect(request.fallbacks).toBe("default");
    });

    it("asks what a user would ask, for this applicant", () => {
        const request = reviewRequest(testCase, CONFIGS["medium-text"]);
        expect(request.messages.at(-1).content).toMatch(/Junior Frontend Developer roles in Melbourne/);
        expect(request.output_config.effort).toBe("medium");
    });

    it("puts the resume text in the prompt in text mode", () => {
        const request = reviewRequest(testCase, CONFIGS["medium-text"]);
        expect(request.system).toContain(testCase.resumeText.slice(0, 40));
    });

    it("attaches the case's real PDF in pdf mode", () => {
        const request = reviewRequest(testCase, CONFIGS["medium-pdf"]);
        const [document] = request.messages.at(-1).content;
        expect(document.type).toBe("document");
        expect(document.title).toBe("r01.pdf");
        expect(Buffer.from(document.source.data, "base64").subarray(0, 5).toString()).toBe("%PDF-");
        expect(request.system).not.toContain(testCase.resumeText.slice(0, 40));
    });

    it("compares the four configurations of the plan", () => {
        expect(Object.keys(CONFIGS)).toEqual(["medium-text", "high-text", "medium-pdf", "high-pdf"]);
    });
});
