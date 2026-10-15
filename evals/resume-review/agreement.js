#!/usr/bin/env node
/**
 * Checks the judge against the owner's hand labels (AC-E6.5):
 *
 *     npm run eval:judge-agreement                  # the newest run
 *     npm run eval:judge-agreement -- <results.json>
 *
 * For every labelled review in the run, compares the owner's verdict on each
 * planted problem with the judge's. Nothing is sent to the API: the run's
 * judge already graded these reviews.
 *
 * The result is saved to judge-check.json with the judge's fingerprint. Every
 * later run with the same judge prints it next to its scores; a run whose
 * judge has changed since, or fell below the threshold, is marked not valid.
 */
const fs = require("fs");
const path = require("path");
const { loadLabels, reviewId, resolveResultsFile } = require("./labels");

/** The share of verdicts on which judge and owner must agree. */
const AGREEMENT_THRESHOLD = 0.8;
/** How many labelled reviews a check needs before it counts. */
const MIN_LABELLED = 20;

const JUDGE_CHECK_FILE = path.join(__dirname, "..", "datasets", "resume-review", "judge-check.json");

/**
 * Compares the owner's labels with the judge's verdicts on the same reviews.
 *
 * Raw agreement can flatter a judge: if nearly every problem is found, a
 * judge that always says "found" agrees nearly always. Cohen's kappa
 * corrects for the agreement chance alone would give — 0 is no better than
 * chance, 1 is perfect — and the four counts show where any disagreement is.
 */
function compare(labels, results) {
    const judged = new Map();
    for (const r of results) {
        if (typeof r.output === "string" && r.judgement) judged.set(reviewId(r.output), r.judgement);
    }

    const counts = { bothFound: 0, bothMissed: 0, judgeOnly: 0, ownerOnly: 0 };
    const disagreements = [];
    let reviews = 0;
    for (const label of labels) {
        const judgement = judged.get(label.reviewId);
        if (!judgement) continue;
        reviews++;
        for (const [issue, owner] of Object.entries(label.found)) {
            const judge = judgement.issues.find((i) => i.id === issue)?.found;
            if (judge === undefined) throw new Error(`The judge gave no verdict on ${issue} in ${label.reviewId}`);
            if (judge && owner) counts.bothFound++;
            else if (!judge && !owner) counts.bothMissed++;
            else {
                counts[judge ? "judgeOnly" : "ownerOnly"]++;
                disagreements.push({ reviewId: label.reviewId, caseId: label.caseId, issue, owner, judge });
            }
        }
    }

    const verdicts = counts.bothFound + counts.bothMissed + counts.judgeOnly + counts.ownerOnly;
    const agreement = verdicts ? (counts.bothFound + counts.bothMissed) / verdicts : null;
    let kappa = null;
    if (verdicts) {
        const judgeYes = (counts.bothFound + counts.judgeOnly) / verdicts;
        const ownerYes = (counts.bothFound + counts.ownerOnly) / verdicts;
        const chance = judgeYes * ownerYes + (1 - judgeYes) * (1 - ownerYes);
        kappa = chance < 1 ? (agreement - chance) / (1 - chance) : null;
    }
    return { reviews, verdicts, agreement, kappa, ...counts, disagreements };
}

/** Whether a check is enough to trust the judge. */
function verdictOf(check) {
    if (check.reviews < MIN_LABELLED) {
        return { passed: false, reason: `only ${check.reviews} labelled review(s); ${MIN_LABELLED} needed` };
    }
    if (check.agreement < AGREEMENT_THRESHOLD) {
        return { passed: false, reason: `agreement below ${AGREEMENT_THRESHOLD * 100}%` };
    }
    return { passed: true, reason: null };
}

/** What a run says about its judge, from the last saved check. */
function judgeValidity(fingerprint, file = JUDGE_CHECK_FILE) {
    if (!fs.existsSync(file)) {
        return { valid: false, reason: "the judge has not been checked against hand labels yet" };
    }
    const check = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (check.fingerprint !== fingerprint) {
        return { valid: false, reason: "the judge has changed since it was checked", check };
    }
    return { valid: check.passed, reason: check.reason, check };
}

const pct = (x) => (x === null ? "-" : `${(x * 100).toFixed(1)}%`);

function describeValidity(validity) {
    const c = validity.check;
    const measured = c
        ? `judge agreement ${pct(c.agreement)}, kappa ${c.kappa === null ? "-" : c.kappa.toFixed(2)}, on ${c.reviews} hand-labelled reviews (${c.checkedOn})`
        : "judge agreement not measured";
    return `${measured} - run ${validity.valid ? "VALID" : `NOT VALID: ${validity.reason}`}`;
}

function main() {
    // Loaded here so the pure functions above stay free of the product code.
    const { JUDGE_FINGERPRINT } = require("./judge");
    const { JUDGE_MODEL } = require("../graders/llmJudge");

    const file = resolveResultsFile(process.argv[2]);
    const run = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (run.judgeFingerprint !== JUDGE_FINGERPRINT) {
        throw new Error(
            "This run was judged by a different judge (rubric, model or prompt) from the current one. " +
                "Its verdicts cannot check today's judge.",
        );
    }

    const check = compare(loadLabels(), run.results);
    const { passed, reason } = verdictOf(check);
    const record = {
        fingerprint: JUDGE_FINGERPRINT,
        judgeModel: JUDGE_MODEL,
        checkedOn: new Date().toISOString().slice(0, 10),
        run: path.basename(file),
        threshold: AGREEMENT_THRESHOLD,
        reviews: check.reviews,
        verdicts: check.verdicts,
        agreement: check.agreement,
        kappa: check.kappa,
        bothFound: check.bothFound,
        bothMissed: check.bothMissed,
        judgeOnly: check.judgeOnly,
        ownerOnly: check.ownerOnly,
        disagreements: check.disagreements,
        passed,
        reason,
    };

    console.log(`Run: ${file}`);
    console.log(`Labelled reviews in this run: ${check.reviews} (verdicts: ${check.verdicts})`);
    console.log(`Agreement: ${pct(check.agreement)}   Cohen's kappa: ${check.kappa === null ? "-" : check.kappa.toFixed(2)}`);
    console.log(`  both said found:        ${check.bothFound}`);
    console.log(`  both said not found:    ${check.bothMissed}`);
    console.log(`  only the judge found:   ${check.judgeOnly}`);
    console.log(`  only the owner found:   ${check.ownerOnly}`);
    for (const d of check.disagreements) {
        console.log(`  - ${d.caseId} ${d.issue}: owner ${d.owner ? "found" : "not found"}, judge ${d.judge ? "found" : "not found"} (review ${d.reviewId})`);
    }
    if (check.reviews === 0) {
        console.log("No labelled review is from this run, so nothing was saved.");
        return;
    }

    fs.writeFileSync(JUDGE_CHECK_FILE, `${JSON.stringify(record, null, 2)}\n`);
    const validity = judgeValidity(JUDGE_FINGERPRINT);
    run.validity = { valid: validity.valid, reason: validity.reason, agreement: check.agreement, reviews: check.reviews };
    fs.writeFileSync(file, JSON.stringify(run, null, 2));
    console.log(`\n${describeValidity(validity)}`);
    console.log(`Saved to ${JUDGE_CHECK_FILE}; the run's results file now records it too.`);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    AGREEMENT_THRESHOLD,
    MIN_LABELLED,
    JUDGE_CHECK_FILE,
    compare,
    verdictOf,
    judgeValidity,
    describeValidity,
};
