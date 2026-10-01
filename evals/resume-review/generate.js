#!/usr/bin/env node
/**
 * Generates the synthetic resumes for the resume-review eval:
 *
 *     npm run eval:generate-resumes -- [--only r01,r02] [--sync] [--yes] [--force]
 *     npm run eval:generate-resumes -- --collect <batchId>
 *
 * For each entry in plan.js, asks Claude Sonnet 5 for a realistic resume with
 * exactly the planned problems in it and no others, and gets back structured
 * output: the resume text, and where each problem was planted. The output is
 * checked — the issues match the plan, and every quoted piece of evidence is
 * really in the resume — before it is saved as an unreviewed case. Nothing is
 * used in an eval until a person has reviewed it (review.js).
 *
 * Existing cases are skipped unless --force. Batched by default, at half price.
 * The batch id is printed as soon as it is submitted: if this process stops,
 * the batch still finishes (and is still paid for) on the server, and
 * --collect fetches its results without sending anything new.
 */
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { ISSUES } = require("./taxonomy");
const { PLAN } = require("./plan");
const { validateCase } = require("./schema");
const { CASES_DIR } = require("./dataset");
const { renderResumePdf } = require("./render");
const { runBatch, collectBatch } = require("../harness/batch");
const { costOf } = require("../harness/cost");
const { checkBudget, budgetFromEnv } = require("../harness/budget");

/** Cheaper than the product's model, and writing a resume is well within it. */

/**
 * A resume with too-long planted must really be long: about 2,800 characters
 * fill a page as rendered, so the minimum is well past two pages. The prompt
 * asks for more, because the model tends to stop short of a length target.
 */
const TOO_LONG_MIN_CHARS = 7500;
const TOO_LONG_TARGET_CHARS = 9000;
const MODEL = "claude-sonnet-5";

/** Structured output: the resume, and where each problem was planted. */
const OUTPUT_SCHEMA = {
    type: "object",
    properties: {
        resumeText: { type: "string" },
        plantedIssues: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    issue: { type: "string", enum: ISSUES.map((i) => i.id) },
                    where: { type: "string" },
                    evidence: { type: "string" },
                },
                required: ["issue", "where", "evidence"],
                additionalProperties: false,
            },
        },
    },
    required: ["resumeText", "plantedIssues"],
    additionalProperties: false,
};

const describe = (issue) =>
    `- ${issue.id} (${issue.name}): ${issue.definition} For example: "${issue.example}". Does not count: ${issue.doesNotCount}`;

function buildPrompt(entry) {
    const planted = ISSUES.filter((i) => entry.issues.includes(i.id));
    const avoided = ISSUES.filter((i) => !entry.issues.includes(i.id));
    const hideLocation = entry.issues.includes("missing-local-context");

    return [
        "Write a realistic resume, in plain text, for testing a resume-review tool.",
        "",
        `The applicant: a ${entry.background}, applying for ${entry.targetRole} roles${hideLocation ? "" : ` in ${entry.location}`}, Australia.`,
        "",
        "Plant exactly these problems, clearly enough that a careful reviewer would notice each one, but the way a real applicant would make them — not as caricatures:",
        ...planted.map(describe),
        "",
        "Avoid every other problem below; apart from what is planted, the resume should be good:",
        ...avoided.map(describe),
        "",
        "Rules:",
        "- Invent everything: the person, employers, projects and universities are fictional. Use a name that is not a real public figure, an @example.com email, and a 0400 000 000 style phone number.",
        hideLocation
            ? "- Leave out the city and any mention of work rights or visa status: that is the planted problem."
            : `- Put ${entry.location} in the header, and a line on work rights that fits the applicant's background.`,
        "- Use plain text with section headings in capitals (SUMMARY, SKILLS, EXPERIENCE, PROJECTS, EDUCATION and so on) and '- ' for bullets. No markdown.",
        "- Dates as MM/YYYY.",
        ...(entry.issues.includes("too-long")
            ? [`- The planted 'too long' problem must be real: at least ${TOO_LONG_TARGET_CHARS} characters, three full pages or more, padded the way junior applicants pad — every university assignment, long paragraphs under each role, every course, hobbies and references.`]
            : []),
        ...(entry.issues.includes("unsupported-skills")
            ? []
            : ["- Every skill in the skills section must appear in the experience or projects. Listing an unused skill is a problem you must not plant here."]),
        ...(entry.issues.includes("unexplained-dates")
            ? []
            : ["- Keep dates in order with no gap longer than six months unless the resume explains it in a line (study, travel, visa, caring)."]),
        "",
        "Then list each planted problem once, even if it shows up in several places: its id, where it is in the resume (for example 'Experience > Acme Pty Ltd, 2nd bullet'), and as evidence the exact text from the resume that shows it most clearly, copied character for character as one continuous piece — never joined with '...' or shortened. When there is nothing to quote — something missing, or the whole resume being too long — give an empty string.",
    ].join("\n");
}

function buildRequest(entry) {
    return {
        model: MODEL,
        max_tokens: 12000,
        thinking: { type: "adaptive" },
        output_config: {
            effort: "medium",
            format: { type: "json_schema", schema: OUTPUT_SCHEMA },
        },
        messages: [{ role: "user", content: buildPrompt(entry) }],
    };
}

/**
 * Turns the model's structured output into a case, or throws saying why it
 * cannot be used: the planted issues must be exactly the planned ones, and
 * quoted evidence must really appear in the resume.
 */
function toCase(entry, message) {
    if (message.stop_reason !== "end_turn") {
        throw new Error(`stopped with ${message.stop_reason}`);
    }
    const text = message.content.find((b) => b.type === "text")?.text;
    const output = JSON.parse(text);

    // A problem planted in several places is sometimes listed once per place.
    // Keep one entry per problem: every location, and the first evidence.
    const merged = new Map();
    for (const p of output.plantedIssues) {
        const seen = merged.get(p.issue);
        if (!seen) merged.set(p.issue, { ...p });
        else {
            seen.where = `${seen.where}; ${p.where}`;
            if (!seen.evidence) seen.evidence = p.evidence;
        }
    }
    output.plantedIssues = [...merged.values()];

    const planned = [...entry.issues].sort().join(",");
    const reported = output.plantedIssues.map((p) => p.issue).sort().join(",");
    if (planned !== reported) {
        throw new Error(`planted [${reported}] but the plan was [${planned}]`);
    }
    if (entry.issues.includes("too-long") && output.resumeText.length < TOO_LONG_MIN_CHARS) {
        throw new Error(
            `too-long is planted but the resume is only ${output.resumeText.length} characters (needs ${TOO_LONG_MIN_CHARS})`,
        );
    }
    for (const p of output.plantedIssues) {
        if (p.evidence && !output.resumeText.includes(p.evidence)) {
            throw new Error(`evidence for ${p.issue} is not in the resume: "${p.evidence}"`);
        }
    }

    return validateCase({
        id: entry.id,
        source: "synthetic",
        persona: { targetRole: entry.targetRole, location: entry.location },
        resumeText: output.resumeText,
        pdfFile: `${entry.id}.pdf`,
        plantedIssues: output.plantedIssues.map(({ issue, where, evidence }) => ({
            issue,
            where,
            ...(evidence ? { evidence } : {}),
        })),
        reviewedBy: null,
        reviewedOn: null,
    });
}

/** A generous guess for the budget check: thinking plus a long resume. */
const estimate = (entry) => ({
    input_tokens: 2500,
    output_tokens: entry.issues.includes("too-long") ? 7000 : 4500,
});

function parseArgs(argv) {
    const options = { only: null, sync: false, yes: false, force: false, collect: null };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--only") options.only = argv[++i].split(",");
        else if (argv[i] === "--collect") options.collect = argv[++i];
        else if (argv[i] === "--sync") options.sync = true;
        else if (argv[i] === "--yes") options.yes = true;
        else if (argv[i] === "--force") options.force = true;
        else throw new Error(`Unknown option ${argv[i]}`);
    }
    return options;
}

/** Saves each usable result as an unreviewed case with its PDF. */
async function saveOutcomes(outcomes, { batch, collected = false }) {
    let spent = 0;
    for (const { entry, message, error } of outcomes) {
        if (error) {
            console.log(`${entry.id}: request failed — ${error}`);
            continue;
        }
        spent += costOf(message.usage, message.model, { batch });
        try {
            const testCase = toCase(entry, message);
            fs.writeFileSync(path.join(CASES_DIR, `${entry.id}.json`), `${JSON.stringify(testCase, null, 2)}\n`);
            await renderResumePdf(testCase.resumeText, path.join(CASES_DIR, testCase.pdfFile));
            console.log(`${entry.id}: saved (${testCase.plantedIssues.map((p) => p.issue).join(", ")})`);
        } catch (err) {
            console.log(`${entry.id}: rejected — ${err.message}`);
        }
    }
    console.log(
        collected
            ? `Nothing new was paid for; the batch cost about US$${spent.toFixed(3)} when it was submitted.`
            : `Cost about US$${spent.toFixed(3)}.`,
    );
    console.log("Review the new cases with: npm run eval:review-resumes");
}

function makeClient() {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");
    const Anthropic = require("@anthropic-ai/sdk");
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    fs.mkdirSync(CASES_DIR, { recursive: true });

    if (options.collect) {
        // Fetch a batch submitted earlier. Nothing new is sent or paid for.
        const { results } = await collectBatch({
            client: makeClient(),
            batchId: options.collect,
            pollMs: 20_000,
            onProgress: (b) => console.log(`batch ${b.id}: ${b.processing_status}`),
        });
        const outcomes = PLAN.filter((e) => results.has(e.id)).map((e) => ({ entry: e, ...results.get(e.id) }));
        await saveOutcomes(outcomes, { batch: true, collected: true });
        return;
    }

    const todo = PLAN.filter(
        (e) =>
            (!options.only || options.only.includes(e.id)) &&
            (options.force || !fs.existsSync(path.join(CASES_DIR, `${e.id}.json`))),
    );
    if (todo.length === 0) {
        console.log("Nothing to generate. Use --force to replace existing cases.");
        return;
    }

    const batch = !options.sync;
    const estimateUsd = todo.reduce((sum, e) => sum + costOf(estimate(e), MODEL, { batch }), 0);
    console.log(`${todo.length} resume(s), ${batch ? "batched" : "live"}, estimated US$${estimateUsd.toFixed(3)}`);
    const verdict = checkBudget(estimateUsd, budgetFromEnv(), { yes: options.yes });
    if (verdict.message) console.log(verdict.message);
    if (!verdict.ok) {
        process.exitCode = 1;
        return;
    }
    const client = makeClient();

    let outcomes;
    if (batch) {
        const { results } = await runBatch({
            client,
            requests: todo.map((e) => ({ id: e.id, params: buildRequest(e) })),
            pollMs: 20_000,
            onSubmitted: (id) =>
                console.log(`Submitted batch ${id}. If this stops, collect it later with --collect ${id}`),
            onProgress: (b) => console.log(`batch ${b.id}: ${b.processing_status}`),
        });
        outcomes = todo.map((e) => ({ entry: e, ...results.get(e.id) }));
    } else {
        outcomes = [];
        for (const e of todo) {
            try {
                outcomes.push({ entry: e, message: await client.messages.create(buildRequest(e)) });
            } catch (error) {
                outcomes.push({ entry: e, error: error.message });
            }
        }
    }

    await saveOutcomes(outcomes, { batch });
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { buildPrompt, buildRequest, toCase, OUTPUT_SCHEMA, MODEL, parseArgs, TOO_LONG_MIN_CHARS };
