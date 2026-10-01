#!/usr/bin/env node
/**
 * Walks through the resume-review cases nobody has reviewed yet:
 *
 *     npm run eval:review-resumes
 *
 * Shows each generated resume and the problems planted in it, and asks two
 * questions: can each planted problem really be seen, and does the resume
 * read like one a real applicant would send? Approved cases are stamped with
 * the reviewer and date, and only those are used in eval runs. Rejected ones
 * are deleted so they can be regenerated.
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const { execSync } = require("child_process");
const { ISSUES } = require("./taxonomy");
const { loadCases, CASES_DIR } = require("./dataset");

const issueById = Object.fromEntries(ISSUES.map((i) => [i.id, i]));

/** Returns the case stamped as reviewed; does not change the original. */
function approve(testCase, reviewer, date) {
    return { ...testCase, reviewedBy: reviewer, reviewedOn: date };
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function reviewerName() {
    if (process.env.EVAL_REVIEWER) return process.env.EVAL_REVIEWER;
    try {
        return execSync("git config user.name", { stdio: ["ignore", "pipe", "ignore"] })
            .toString()
            .trim();
    } catch {
        return "owner";
    }
}

function show(testCase, index, total) {
    const rule = "=".repeat(72);
    console.log(`\n${rule}\nCase ${index + 1} of ${total}: ${testCase.id}`);
    console.log(`Applying for: ${testCase.persona.targetRole} (${testCase.persona.location})`);
    if (testCase.pdfFile) console.log(`PDF: ${path.join(CASES_DIR, testCase.pdfFile)}`);
    console.log(`${rule}\n${testCase.resumeText}\n${rule}`);
    console.log("Planted problems:");
    for (const p of testCase.plantedIssues) {
        const issue = issueById[p.issue];
        console.log(`\n  * ${issue.name} [${p.issue}]`);
        console.log(`    Where: ${p.where}`);
        if (p.evidence) console.log(`    Shows as: "${p.evidence}"`);
        console.log(`    Means: ${issue.definition}`);
    }
}

async function main() {
    const pending = loadCases().filter((c) => !c.reviewedBy);
    if (pending.length === 0) {
        console.log("Every case has been reviewed.");
        return;
    }
    const reviewer = reviewerName();
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let approved = 0;
    let rejected = 0;

    try {
        for (const [index, testCase] of pending.entries()) {
            show(testCase, index, pending.length);
            const answer = (
                await rl.question(
                    "\nCan you see each planted problem, and does it read like a real resume?\n" +
                        "[y] approve   [n] reject and delete   [s] skip   [q] quit > ",
                )
            )
                .trim()
                .toLowerCase();

            const jsonFile = path.join(CASES_DIR, `${testCase.id}.json`);
            if (answer === "y") {
                fs.writeFileSync(
                    jsonFile,
                    `${JSON.stringify(approve(testCase, reviewer, today()), null, 2)}\n`,
                );
                approved++;
                console.log(`Approved ${testCase.id}.`);
            } else if (answer === "n") {
                fs.rmSync(jsonFile);
                if (testCase.pdfFile) fs.rmSync(path.join(CASES_DIR, testCase.pdfFile), { force: true });
                rejected++;
                console.log(
                    `Deleted ${testCase.id}. Regenerate it with: npm run eval:generate-resumes -- --only ${testCase.id}`,
                );
            } else if (answer === "q") {
                break;
            } else {
                console.log(`Skipped ${testCase.id}.`);
            }
        }
    } finally {
        rl.close();
    }
    console.log(`\n${approved} approved, ${rejected} rejected this session.`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { approve };
