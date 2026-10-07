#!/usr/bin/env node
/**
 * Runs one eval:
 *
 *     npm run eval -- <name> [--configs a,b] [--limit N] [--runs N]
 *                            [--sync] [--yes] [--concurrency N]
 *
 *   --configs      only these configurations (default: all)
 *   --limit        only the first N cases — for cheap trial runs
 *   --runs         repeat each case N times, to see spread (default 1)
 *   --sync         send requests live instead of through the Batch API
 *                  (full price, but seconds rather than minutes)
 *   --yes          run even when the estimate is over EVAL_BUDGET_USD
 *   --concurrency  live requests in flight at once (default 4)
 *   --resume ID    continue a batched run that stopped, collecting the
 *                  batches it had already submitted instead of paying again
 *
 * Evals call paid APIs, so they are never part of `npm test` or CI.
 */
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { runEval } = require("./harness/runEval");
const { budgetFromEnv } = require("./harness/budget");

function parseArgs(argv) {
    const [name, ...rest] = argv;
    const options = { name };
    for (let i = 0; i < rest.length; i++) {
        const flag = rest[i];
        const value = () => {
            const v = rest[++i];
            if (v === undefined) throw new Error(`${flag} needs a value`);
            return v;
        };
        if (flag === "--configs") options.configNames = value().split(",");
        else if (flag === "--limit") options.limit = Number(value());
        else if (flag === "--runs") options.runs = Number(value());
        else if (flag === "--concurrency") options.concurrency = Number(value());
        else if (flag === "--sync") options.sync = true;
        else if (flag === "--yes") options.yes = true;
        else if (flag === "--resume") options.resume = value();
        else throw new Error(`Unknown option ${flag}`);
    }
    if (!options.name) throw new Error("Usage: npm run eval -- <name> [options]");
    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const evalModule = require(path.join(__dirname, options.name, "eval.js"));
    const resultsDir = path.join(__dirname, "results");

    // A resumed run takes its options from its state file, so it cannot be
    // continued with a different selection than it started with.
    let resumeState = null;
    if (options.resume) {
        const file = path.join(resultsDir, options.name, `${options.resume}.state.json`);
        if (!fs.existsSync(file)) throw new Error(`No saved run ${options.resume} (${file})`);
        resumeState = JSON.parse(fs.readFileSync(file, "utf-8"));
        Object.assign(options, resumeState.options);
    }

    // Only an eval that calls the model needs a key, so a local one runs
    // without any configuration at all.
    let client = null;
    const callsModel = typeof evalModule.request === "function" || typeof evalModule.judge === "function";
    if (callsModel && process.env.ANTHROPIC_API_KEY) {
        const Anthropic = require("@anthropic-ai/sdk");
        client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    const outcome = await runEval({
        evalModule,
        evalName: options.name,
        configNames: options.configNames,
        limit: options.limit,
        runs: options.runs,
        sync: options.sync,
        yes: options.yes,
        concurrency: options.concurrency,
        budgetUsd: budgetFromEnv(),
        client,
        resultsDir,
        resumeState,
    });
    if (outcome.aborted) process.exitCode = 1;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { parseArgs };
