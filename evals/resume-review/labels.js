const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/**
 * The owner's hand labels: for a review the assistant wrote, which planted
 * problems it really found. They are the ground truth the judge is checked
 * against (AC-E6.5), so they are committed with the dataset.
 *
 * A label keeps the review's full text, so it stays meaningful after the run
 * that produced the review is gone, and the judge can be re-checked on it.
 */
const LABELS_FILE = path.join(__dirname, "..", "datasets", "resume-review", "labels.json");
const RESULTS_DIR = path.join(__dirname, "..", "results", "resume-review");

/** A stable id for a review's text. */
function reviewId(text) {
    return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function loadLabels(file = LABELS_FILE) {
    if (!fs.existsSync(file)) return [];
    const labels = JSON.parse(fs.readFileSync(file, "utf-8"));
    for (const label of labels) {
        if (reviewId(label.review) !== label.reviewId) {
            throw new Error(`Label ${label.reviewId} does not match its review text`);
        }
        if (!label.labelledBy || !label.labelledOn) {
            throw new Error(`Label ${label.reviewId} has no labeller or date`);
        }
    }
    return labels;
}

function saveLabels(labels, file = LABELS_FILE) {
    fs.writeFileSync(file, `${JSON.stringify(labels, null, 2)}\n`);
}

/** A results file by path, or the newest run's when none is given. */
function resolveResultsFile(arg, dir = RESULTS_DIR) {
    if (arg) return path.resolve(arg);
    const runs = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".state.json")).sort()
        : [];
    if (runs.length === 0) throw new Error(`No runs in ${dir}; run npm run eval:resume-review first.`);
    return path.join(dir, runs.at(-1));
}

module.exports = { LABELS_FILE, RESULTS_DIR, reviewId, loadLabels, saveLabels, resolveResultsFile };
