/**
 * The generator's pure parts, and the PDF round trip. No API is called.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ISSUE_IDS } = require("./taxonomy");
const { PLAN } = require("./plan");
const { buildRequest, buildPrompt, toCase, MODEL, parseArgs } = require("./generate");
const { renderResumePdf } = require("./render");
const { approve } = require("./review");
const { extractText } = require("../../src/resumes/resumeText");

const RESUME = [
    "JORDAN LEE",
    "jordan.lee@example.com | 0400 000 000",
    "",
    "SUMMARY",
    "Passionate team player who loves to learn and grow.",
    "",
    "EXPERIENCE",
    "Frontend Intern - Fictional Digital (02/2025 - 07/2025)",
    "- Responsible for building pages in React.",
    "- Improved the performance of the website.",
    "",
    "PROJECTS",
    "Weather Board - React, TypeScript",
    "A dashboard of forecasts for five cities, refreshed every ten minutes.",
].join("\n");

const reply = (output, extra = {}) => ({
    stop_reason: "end_turn",
    model: MODEL,
    usage: { input_tokens: 2000, output_tokens: 3000 },
    content: [{ type: "text", text: JSON.stringify(output) }],
    ...extra,
});

const entry = { id: "r99", targetRole: "Junior Frontend Developer", location: "Hobart", background: "graduate", issues: ["generic-summary", "no-metrics"] };

describe("plan", () => {
    it("plants each issue three or four times, two to four per resume", () => {
        const counts = Object.fromEntries(ISSUE_IDS.map((id) => [id, 0]));
        for (const e of PLAN) {
            expect(e.issues.length).toBeGreaterThanOrEqual(2);
            expect(e.issues.length).toBeLessThanOrEqual(4);
            expect(new Set(e.issues).size).toBe(e.issues.length);
            for (const issue of e.issues) counts[issue]++;
        }
        for (const [id, n] of Object.entries(counts)) {
            expect([id, n >= 3 && n <= 4]).toEqual([id, true]);
        }
        expect(new Set(PLAN.map((e) => e.id)).size).toBe(PLAN.length);
    });
});

describe("buildRequest", () => {
    it("asks Sonnet 5 for structured output", () => {
        const request = buildRequest(entry);
        expect(request.model).toBe("claude-sonnet-5");
        expect(request.output_config.format.type).toBe("json_schema");
        expect(request.output_config.format.schema.required).toEqual(["resumeText", "plantedIssues"]);
    });

    it("names the planted issues, and tells the model to avoid the rest", () => {
        const prompt = buildPrompt(entry);
        const [plantSection, avoidSection] = prompt.split("Avoid every other problem");
        expect(plantSection).toContain("generic-summary");
        expect(plantSection).not.toContain("missing-links");
        expect(avoidSection).toContain("missing-links");
    });

    it("guards against the problems most easily planted by accident", () => {
        expect(buildPrompt(entry)).toMatch(/Every skill in the skills section must appear/);
        expect(buildPrompt(entry)).toMatch(/no gap longer than six months/);
        const planted = buildPrompt({ ...entry, issues: ["unsupported-skills", "unexplained-dates"] });
        expect(planted).not.toMatch(/Every skill in the skills section must appear/);
        expect(planted).not.toMatch(/no gap longer than six months/);
    });

    it("keeps the city out when missing local context is the planted problem", () => {
        const prompt = buildPrompt({ ...entry, issues: ["missing-local-context", "no-metrics"] });
        expect(prompt).toMatch(/Leave out the city/);
        expect(prompt).not.toContain("Hobart");
    });
});

describe("toCase", () => {
    const good = {
        resumeText: RESUME.padEnd(420, " "),
        plantedIssues: [
            { issue: "generic-summary", where: "Summary", evidence: "Passionate team player who loves to learn and grow." },
            { issue: "no-metrics", where: "Experience, 2nd bullet", evidence: "Improved the performance of the website." },
        ],
    };

    it("turns a matching reply into an unreviewed case", () => {
        const testCase = toCase(entry, reply(good));
        expect(testCase).toMatchObject({ id: "r99", source: "synthetic", reviewedBy: null, pdfFile: "r99.pdf" });
        expect(testCase.plantedIssues).toHaveLength(2);
    });

    it("drops empty evidence, for problems with nothing to quote", () => {
        const withEmpty = { ...good, plantedIssues: [good.plantedIssues[0], { issue: "no-metrics", where: "Experience", evidence: "" }] };
        expect(toCase(entry, reply(withEmpty)).plantedIssues[1]).not.toHaveProperty("evidence");
    });

    it("merges a problem listed once per place into one entry", () => {
        const twice = {
            ...good,
            plantedIssues: [
                ...good.plantedIssues,
                { issue: "no-metrics", where: "Projects", evidence: "A dashboard of forecasts for five cities, refreshed every ten minutes." },
            ],
        };
        const testCase = toCase(entry, reply(twice));
        expect(testCase.plantedIssues).toHaveLength(2);
        expect(testCase.plantedIssues[1].where).toBe("Experience, 2nd bullet; Projects");
        expect(testCase.plantedIssues[1].evidence).toBe("Improved the performance of the website.");
    });

    it("rejects a reply whose planted issues differ from the plan", () => {
        const wrong = { ...good, plantedIssues: [good.plantedIssues[0], { issue: "too-long", where: "All", evidence: "" }] };
        expect(() => toCase(entry, reply(wrong))).toThrow(/plan was/);
    });

    it("rejects evidence that is not in the resume", () => {
        const invented = { ...good, plantedIssues: [good.plantedIssues[0], { ...good.plantedIssues[1], evidence: "Made things faster." }] };
        expect(() => toCase(entry, reply(invented))).toThrow(/not in the resume/);
    });

    it("rejects a reply that was cut off", () => {
        expect(() => toCase(entry, reply(good, { stop_reason: "max_tokens" }))).toThrow(/max_tokens/);
    });
});

describe("renderResumePdf", () => {
    it("writes a PDF the product's extractor can read back", async () => {
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pdf-")), "r.pdf");
        await renderResumePdf(RESUME, file);

        const result = await extractText(fs.readFileSync(file));
        expect(result.status).toBe("ok");
        expect(result.text).toContain("JORDAN LEE");
        expect(result.text).toContain("Improved the performance of the website.");
    });
});

describe("review", () => {
    it("stamps an approved case with the reviewer and date, without changing the rest", () => {
        const testCase = { id: "r99", reviewedBy: null, reviewedOn: null, resumeText: "x" };
        expect(approve(testCase, "GeneCLee6", "2026-09-30")).toEqual({
            id: "r99",
            reviewedBy: "GeneCLee6",
            reviewedOn: "2026-09-30",
            resumeText: "x",
        });
        expect(testCase.reviewedBy).toBeNull();
    });
});

describe("parseArgs", () => {
    it("reads the options", () => {
        expect(parseArgs(["--only", "r01,r02", "--sync", "--force"])).toEqual({
            only: ["r01", "r02"],
            sync: true,
            yes: false,
            force: true,
            collect: null,
        });
        expect(parseArgs(["--collect", "msgbatch_1"]).collect).toBe("msgbatch_1");
    });
});
