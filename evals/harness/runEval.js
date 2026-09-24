const path = require("path");
const { runCases } = require("./runCases");
const { runBatch } = require("./batch");
const { costOf } = require("./cost");
const { checkBudget } = require("./budget");
const { summarise, formatTable, writeResults } = require("./report");
const { SOURCE, CHECKED_ON } = require("../pricing");

/**
 * An eval module provides:
 *
 * - `loadCases()` → [{ id, ... }]            the dataset
 * - `configs` → { name: config }             what to compare
 * - `score(case, output, config)` → { metric: number }, may be async
 *
 * and produces each output in one of two ways:
 *
 * - `run(case, config)` → output             computed locally, no API
 * - `request(case, config)` → API params     sent to the model, plus
 *   `parse(message, case, config)` → output  and
 *   `estimate(case, config)` → { model, input_tokens, output_tokens }
 *                                            for the budget check.
 */

function pickConfigs(all, names) {
    if (!names || names.length === 0) return all;
    const picked = {};
    for (const name of names) {
        if (!all[name]) {
            throw new Error(
                `Unknown config "${name}". Available: ${Object.keys(all).join(", ")}`,
            );
        }
        picked[name] = all[name];
    }
    return picked;
}

async function runEval({
    evalModule,
    evalName,
    configNames,
    limit,
    runs = 1,
    sync = false,
    yes = false,
    concurrency = 4,
    budgetUsd,
    client,
    resultsDir,
    log = console.log,
    pollMs,
    sleep,
}) {
    const startedAt = new Date().toISOString();
    const allCases = evalModule.loadCases();
    const cases = limit ? allCases.slice(0, limit) : allCases;
    const configs = pickConfigs(evalModule.configs, configNames);
    const usesModel = typeof evalModule.request === "function";
    const batch = usesModel && !sync;
    const mode = usesModel ? (batch ? "batch" : "sync") : "local";

    // Estimate before anything is sent. A local eval costs nothing.
    let estimateUsd = 0;
    if (usesModel) {
        for (const config of Object.values(configs)) {
            for (const testCase of cases) {
                const e = evalModule.estimate(testCase, config);
                estimateUsd += costOf(e, e.model, { batch }) * runs;
            }
        }
    }
    log(
        `${evalName}: ${cases.length} case(s) x ${Object.keys(configs).length} config(s) x ${runs} run(s), ` +
            `mode ${mode}, estimated US$${estimateUsd.toFixed(4)}`,
    );

    const verdict = checkBudget(estimateUsd, budgetUsd, { yes });
    if (verdict.message) log(verdict.message);
    if (!verdict.ok) return { aborted: true, estimateUsd };

    if (usesModel && !client) {
        throw new Error("ANTHROPIC_API_KEY is not set; this eval calls the model.");
    }

    const fromMessage = (message, testCase, config) => ({
        output: evalModule.parse(message, testCase, config),
        usage: message.usage,
        model: message.model,
        costUsd: costOf(message.usage, message.model, { batch }),
    });

    let results;
    if (!usesModel) {
        results = await runCases({
            cases,
            configs,
            runs,
            concurrency,
            runOne: async (testCase, config) => ({
                output: await evalModule.run(testCase, config),
            }),
        });
    } else if (!batch) {
        results = await runCases({
            cases,
            configs,
            runs,
            concurrency,
            runOne: async (testCase, config) => {
                const message = await client.messages.create(
                    evalModule.request(testCase, config),
                );
                return fromMessage(message, testCase, config);
            },
        });
    } else {
        const jobs = [];
        for (const [configName, config] of Object.entries(configs)) {
            for (const testCase of cases) {
                for (let run = 0; run < runs; run++) {
                    jobs.push({
                        id: `${configName}__${testCase.id}__${run}`,
                        configName,
                        config,
                        testCase,
                        run,
                    });
                }
            }
        }
        const { results: byId } = await runBatch({
            client,
            requests: jobs.map((j) => ({ id: j.id, params: evalModule.request(j.testCase, j.config) })),
            pollMs,
            sleep,
            onProgress: (b) =>
                log(`batch ${b.id}: ${b.processing_status} ${JSON.stringify(b.request_counts ?? {})}`),
        });
        results = jobs.map((j) => {
            const entry = byId.get(j.id);
            const base = { caseId: j.testCase.id, config: j.configName, run: j.run, latencyMs: null };
            if (entry.error) return { ...base, error: entry.error };
            try {
                return { ...base, ...fromMessage(entry.message, j.testCase, j.config) };
            } catch (error) {
                return { ...base, error: error.message };
            }
        });
    }

    // Score everything that produced an output.
    const caseById = new Map(cases.map((c) => [c.id, c]));
    for (const r of results) {
        if (r.error) continue;
        try {
            r.scores = await evalModule.score(caseById.get(r.caseId), r.output, configs[r.config]);
        } catch (error) {
            r.error = `scoring failed: ${error.message}`;
        }
    }

    const summary = summarise(results);
    log(`\n${formatTable(summary)}\n`);

    const file = writeResults(path.join(resultsDir, evalName), {
        eval: evalName,
        mode,
        startedAt,
        pricing: { source: SOURCE, checkedOn: CHECKED_ON },
        estimateUsd,
        configs,
        summary,
        results,
    });
    log(`results: ${file}`);

    return { aborted: false, summary, results, file, estimateUsd };
}

module.exports = { runEval };
