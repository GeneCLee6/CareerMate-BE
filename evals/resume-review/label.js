#!/usr/bin/env node
/**
 * Hand-labels reviews from a run, one at a time:
 *
 *     npm run eval:label-reviews                 # the newest run
 *     npm run eval:label-reviews -- <results.json>
 *
 * For each review, shows the problems planted in that resume and the review
 * the assistant wrote, and asks, for each problem: did the review find it?
 * The judge answers the same question; agreement.js compares the two.
 *
 * Labelling is blind. The judge's verdict and the configuration that wrote
 * the review are not shown, and reviews come in an order unrelated to either,
 * so neither can sway the answer. Each answer is saved straight away; quit
 * at any time and carry on later.
 */
const fs = require("fs");
const readline = require("readline/promises");
const { ISSUES } = require("./taxonomy");
const { loadCases } = require("./dataset");
const { reviewQuestion } = require("./request");
const { reviewerName, today } = require("./review");
const { MIN_LABELLED } = require("./agreement");
const { reviewId, loadLabels, saveLabels, resolveResultsFile } = require("./labels");

const issueById = Object.fromEntries(ISSUES.map((i) => [i.id, i]));

/**
 * The reviews in a run still to label, in an order that says nothing about
 * their configuration: sorted by the hash of their text.
 */
function unlabelled(results, labels) {
    const done = new Set(labels.map((l) => l.reviewId));
    const seen = new Set();
    return results
        .filter((r) => !r.error && typeof r.output === "string")
        .map((r) => ({ caseId: r.caseId, review: r.output, reviewId: reviewId(r.output) }))
        .filter((r) => !done.has(r.reviewId) && !seen.has(r.reviewId) && seen.add(r.reviewId))
        .sort((a, b) => a.reviewId.localeCompare(b.reviewId));
}

const RULE =
    "Found = the review names or describes this problem AND ties it to this resume\n" +
    "(quotes it, points at it, or gives a fix for it). Generic advice that would\n" +
    "fit any resume does not count. Saying it is fine does not count. Unsure: n.";

function show(item, testCase, index, total, labelledSoFar) {
    const rule = "=".repeat(72);
    console.log(`\n${rule}\nReview ${index + 1} of ${total} in this run   (labelled so far: ${labelledSoFar}, aim: ${MIN_LABELLED})`);
    console.log(`Resume: ${testCase.id}   PDF: evals/datasets/resume-review/cases/${testCase.pdfFile}`);
    console.log(`The user asked: ${reviewQuestion(testCase)}`);
    console.log(`${rule}\nPROBLEMS PLANTED IN THIS RESUME`);
    for (const [n, p] of testCase.plantedIssues.entries()) {
        const issue = issueById[p.issue];
        console.log(`\n  ${n + 1}. ${issue.name}`);
        console.log(`     Where: ${p.where}`);
        if (p.evidence) console.log(`     Shows as: "${p.evidence}"`);
        console.log(`     Not this: ${issue.doesNotCount}`);
    }
    console.log(`\n${rule}\nTHE REVIEW\n${rule}\n${item.review}\n${rule}\n${RULE}`);
}

async function ask(rl, question, allowed) {
    for (;;) {
        const answer = (await rl.question(question)).trim().toLowerCase();
        if (allowed.includes(answer)) return answer;
        console.log(`Please answer one of: ${allowed.join(", ")}`);
    }
}

async function main() {
    const file = resolveResultsFile(process.argv[2]);
    const run = JSON.parse(fs.readFileSync(file, "utf-8"));
    const cases = new Map(loadCases().map((c) => [c.id, c]));
    const labels = loadLabels();
    const pending = unlabelled(run.results, labels);
    console.log(`Run: ${file}\n${pending.length} review(s) to label; ${labels.length} labelled already.`);
    if (pending.length === 0) return;

    const labeller = reviewerName();
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        for (const [index, item] of pending.entries()) {
            const testCase = cases.get(item.caseId);
            show(item, testCase, index, pending.length, labels.length);
            const next = await ask(rl, "\n[l] label this review   [s] skip   [q] quit > ", ["l", "s", "q"]);
            if (next === "q") break;
            if (next === "s") continue;

            const found = {};
            for (const [n, p] of testCase.plantedIssues.entries()) {
                const answer = await ask(
                    rl,
                    `Did the review find problem ${n + 1}, ${issueById[p.issue].name}? [y/n] > `,
                    ["y", "n"],
                );
                found[p.issue] = answer === "y";
            }
            labels.push({
                reviewId: item.reviewId,
                caseId: item.caseId,
                found,
                labelledBy: labeller,
                labelledOn: today(),
                review: item.review,
            });
            saveLabels(labels);
            console.log(`Saved. ${labels.length} labelled.`);
        }
    } finally {
        rl.close();
    }
    console.log(
        labels.length >= MIN_LABELLED
            ? `\n${labels.length} labelled. Check the judge with: npm run eval:judge-agreement`
            : `\n${labels.length} of ${MIN_LABELLED} labelled. Run this again to carry on.`,
    );
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { unlabelled };
