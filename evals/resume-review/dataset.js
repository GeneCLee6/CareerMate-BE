const fs = require("fs");
const path = require("path");
const { validateCase } = require("./schema");

const CASES_DIR = path.join(__dirname, "..", "datasets", "resume-review", "cases");

/**
 * Reads and validates every case. With `reviewedOnly`, keeps only cases a
 * person has read and approved: a generated resume can be unrealistic in
 * ways that make an eval measure the wrong thing, so it is not used until
 * someone has checked it.
 */
function loadCases({ dir = CASES_DIR, reviewedOnly = false } = {}) {
    if (!fs.existsSync(dir)) return [];
    const cases = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((file) => {
            let data;
            try {
                data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
            } catch (error) {
                throw new Error(`${file}: not valid JSON (${error.message})`);
            }
            return validateCase(data, file);
        });
    return reviewedOnly ? cases.filter((c) => c.reviewedBy) : cases;
}

module.exports = { loadCases, CASES_DIR };
