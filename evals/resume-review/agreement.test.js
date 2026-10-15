const fs = require("fs");
const os = require("os");
const path = require("path");
const { compare, verdictOf, judgeValidity, describeValidity, MIN_LABELLED } = require("./agreement");
const { reviewId, loadLabels, saveLabels, resolveResultsFile } = require("./labels");
const { unlabelled } = require("./label");

const label = (review, found) => ({
    reviewId: reviewId(review),
    caseId: "r01",
    found,
    labelledBy: "Owner",
    labelledOn: "2026-10-15",
    review,
});
const result = (review, verdicts, extra = {}) => ({
    caseId: "r01",
    config: "medium-text",
    output: review,
    judgement: { issues: Object.entries(verdicts).map(([id, found]) => ({ id, found, evidence: "" })) },
    ...extra,
});
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "labels-"));

describe("compare", () => {
    it("counts agreement and where the judge and owner differ", () => {
        const labels = [label("A", { "no-metrics": true, "too-long": false }), label("B", { "no-metrics": true })];
        const results = [result("A", { "no-metrics": true, "too-long": true }), result("B", { "no-metrics": true })];

        const check = compare(labels, results);

        expect(check).toMatchObject({ reviews: 2, verdicts: 3, bothFound: 2, judgeOnly: 1, ownerOnly: 0 });
        expect(check.agreement).toBeCloseTo(2 / 3);
        expect(check.disagreements).toEqual([
            { reviewId: reviewId("A"), caseId: "r01", issue: "too-long", owner: false, judge: true },
        ]);
    });

    it("ignores labels for reviews that are not in the run", () => {
        expect(compare([label("other", { "no-metrics": true })], [result("A", { "no-metrics": true })]).reviews).toBe(0);
    });

    it("corrects for chance with kappa: always saying found agrees often but is no better than chance", () => {
        const labels = [];
        const results = [];
        for (let i = 0; i < 10; i++) {
            labels.push(label(`r${i}`, { "no-metrics": i < 9 }));
            results.push(result(`r${i}`, { "no-metrics": true }));
        }
        const check = compare(labels, results);
        expect(check.agreement).toBeCloseTo(0.9);
        expect(check.kappa).toBeCloseTo(0);
    });
});

describe("verdictOf", () => {
    it(`needs ${MIN_LABELLED} labelled reviews and 80% agreement`, () => {
        expect(verdictOf({ reviews: 19, agreement: 1 }).passed).toBe(false);
        expect(verdictOf({ reviews: 20, agreement: 0.79 }).passed).toBe(false);
        expect(verdictOf({ reviews: 20, agreement: 0.8 })).toEqual({ passed: true, reason: null });
    });
});

describe("judgeValidity", () => {
    const save = (record) => {
        const file = path.join(tmp(), "judge-check.json");
        fs.writeFileSync(file, JSON.stringify(record));
        return file;
    };

    it("marks a run not valid when the judge was never checked", () => {
        const validity = judgeValidity("abc", path.join(tmp(), "missing.json"));
        expect(validity.valid).toBe(false);
        expect(describeValidity(validity)).toMatch(/NOT VALID: the judge has not been checked/);
    });

    it("marks a run not valid when the judge changed since its check", () => {
        const file = save({ fingerprint: "old", passed: true, agreement: 0.9, reviews: 20 });
        expect(judgeValidity("new", file)).toMatchObject({ valid: false, reason: "the judge has changed since it was checked" });
    });

    it("prints the agreement next to a valid run", () => {
        const file = save({ fingerprint: "abc", passed: true, reason: null, agreement: 0.9, kappa: 0.7, reviews: 20, checkedOn: "2026-10-15" });
        const validity = judgeValidity("abc", file);
        expect(validity.valid).toBe(true);
        expect(describeValidity(validity)).toBe(
            "judge agreement 90.0%, kappa 0.70, on 20 hand-labelled reviews (2026-10-15) - run VALID",
        );
    });
});

describe("labels", () => {
    it("round-trips, and refuses a label whose review text was edited", () => {
        const file = path.join(tmp(), "labels.json");
        saveLabels([label("A", { "no-metrics": true })], file);
        expect(loadLabels(file)).toHaveLength(1);

        const edited = JSON.parse(fs.readFileSync(file, "utf-8"));
        edited[0].review = "changed";
        fs.writeFileSync(file, JSON.stringify(edited));
        expect(() => loadLabels(file)).toThrow(/does not match/);
    });

    it("finds the newest run's results, skipping state files", () => {
        const dir = tmp();
        for (const f of ["2026-10-01.json", "2026-10-02.json", "2026-10-03.state.json"]) fs.writeFileSync(path.join(dir, f), "{}");
        expect(path.basename(resolveResultsFile(undefined, dir))).toBe("2026-10-02.json");
    });
});

describe("unlabelled", () => {
    it("offers each successful, not-yet-labelled review once, with nothing about its configuration", () => {
        const results = [
            result("A", {}),
            result("B", {}, { config: "high-text" }),
            result("A", {}, { config: "high-text" }), // the same text twice
            { caseId: "r01", config: "medium-text", error: "failed" },
        ];
        const items = unlabelled(results, [label("B", {})]);
        expect(items).toEqual([{ caseId: "r01", review: "A", reviewId: reviewId("A") }]);
    });
});
