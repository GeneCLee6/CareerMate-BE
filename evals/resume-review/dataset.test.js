/**
 * Checks the resume-review dataset and taxonomy in `npm test`. This costs
 * nothing, and a malformed case fails here instead of in a paid run.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ISSUES, ISSUE_IDS } = require("./taxonomy");
const { validateCase } = require("./schema");
const { loadCases, CASES_DIR } = require("./dataset");

const validCase = () => ({
    id: "fixture-01",
    source: "synthetic",
    persona: { targetRole: "Junior Frontend Developer", location: "Sydney" },
    resumeText: "x".repeat(400),
    plantedIssues: [
        { issue: "no-metrics", where: "Experience", evidence: "Improved performance" },
        { issue: "missing-links", where: "Projects" },
    ],
    reviewedBy: null,
    reviewedOn: null,
});

describe("taxonomy", () => {
    it("has unique, kebab-case ids", () => {
        expect(new Set(ISSUE_IDS).size).toBe(ISSUE_IDS.length);
        for (const id of ISSUE_IDS) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    });

    it("defines every issue fully, including what does not count", () => {
        for (const issue of ISSUES) {
            for (const field of ["name", "definition", "example", "fix", "doesNotCount"]) {
                expect(issue[field]).toEqual(expect.any(String));
                expect(issue[field].length).toBeGreaterThan(10);
            }
        }
    });
});

describe("every case in the dataset", () => {
    it("is valid, and its file is named after its id", () => {
        // Throws naming the file and field if anything is wrong.
        const cases = loadCases();
        expect(cases.length).toBeGreaterThan(0);
        expect(fs.readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"))).toHaveLength(
            cases.length,
        );
    });
});

describe("validateCase", () => {
    it("accepts a well-formed case", () => {
        expect(validateCase(validCase(), "fixture-01.json").id).toBe("fixture-01");
    });

    it("names the file and the field that is wrong", () => {
        const bad = { ...validCase(), plantedIssues: [{ issue: "bad-font", where: "Header" }] };
        expect(() => validateCase(bad, "fixture-01.json")).toThrow(/fixture-01\.json: .*plantedIssues/);
    });

    it("rejects anything but synthetic data", () => {
        expect(() => validateCase({ ...validCase(), source: "real" }, "fixture-01.json")).toThrow(
            /source/,
        );
    });

    it("needs two to four planted issues, each different", () => {
        const one = { ...validCase(), plantedIssues: [validCase().plantedIssues[0]] };
        expect(() => validateCase(one)).toThrow(/plantedIssues/);

        const twice = {
            ...validCase(),
            plantedIssues: [validCase().plantedIssues[0], validCase().plantedIssues[0]],
        };
        expect(() => validateCase(twice)).toThrow(/planted once/);
    });

    it("keeps the reviewer and the review date together", () => {
        expect(() => validateCase({ ...validCase(), reviewedBy: "GeneCLee6" })).toThrow(/reviewedOn/);
    });

    it("requires the file name to match the id", () => {
        expect(() => validateCase(validCase(), "other.json")).toThrow(/should be fixture-01\.json/);
    });
});

describe("loadCases", () => {
    const writeCase = (dir, data) =>
        fs.writeFileSync(path.join(dir, `${data.id}.json`), JSON.stringify(data));

    it("keeps only reviewed cases when asked", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cases-"));
        writeCase(dir, validCase());
        writeCase(dir, {
            ...validCase(),
            id: "fixture-02",
            reviewedBy: "GeneCLee6",
            reviewedOn: "2026-09-30",
        });

        expect(loadCases({ dir })).toHaveLength(2);
        expect(loadCases({ dir, reviewedOnly: true }).map((c) => c.id)).toEqual(["fixture-02"]);
    });

    it("reports a file that is not valid JSON by name", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cases-"));
        fs.writeFileSync(path.join(dir, "broken.json"), "{ not json");
        expect(() => loadCases({ dir })).toThrow(/broken\.json: not valid JSON/);
    });
});
