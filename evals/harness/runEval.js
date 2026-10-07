const fs = require("fs");
const path = require("path");
const { runCases } = require("./runCases");
const { runBatch, collectBatch } = require("./batch");
const { costOf } = require("./cost");
const { checkBudget } = require("./budget");
const { summarise, formatTable, writeResults } = require("./report");
const { SOURCE, CHECKED_ON } = require("../pricing");

/**
 * An eval module provides:
 *
 * - `loadCases()` → [{ id, ... }]            the dataset
 * - `configs` → { name: config }             what to compare
 *
 * and produces each output in one of two ways:
 *
 * - `run(case, config)` → output             computed locally, no API
 * - `request(case, config)` → API params     sent to the model, plus
 *   `parse(message, case, config)` → output  and
 *   `estimate(case, config)` → { model, input_tokens, output_tokens }
 *
 * and grades it in one of two ways:
 *
 * - `score(case, output, config)` → { metric: number }, may be async
 * - `judge(case, output)` → API params for an LLM judge, plus
 *   `scoreJudgement(message, case)` → { scores, judgement } and
 *   `estimateJudge(case)` → { model, input_tokens, output_tokens }.
 *   The judge is never given the configuration: it grades blind.
 *
 * Batched runs save their batch ids in a state file as they are submitted,
 * so a run that stops can be resumed (`resumeState`) without paying again
 * for work the server has already done.
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

const jobId = (configName, caseId, run) => `${configName}__${caseId}__${run}`;

/** Results of a batch: collected if it was already submitted, else submitted now. */
async function batchPhase({ client, state, phase, requests, saveState, log, pollMs, sleep }) {
    const onProgress = (b) =>
        log(`${phase} batch ${b.id}: ${b.processing_status} ${JSON.stringify(b.request_counts ?? {})}`);
    const known = state.phases[phase]?.batchId;
    if (known) {
        log(`${phase}: collecting batch ${known} submitted earlier`);
        const { results } = await collectBatch({
            client,
            batchId: known,
            ids: requests.map((r) => r.id),
            beta: Boolean(requests[0]?.params.betas),
            pollMs,
            onProgress,
            sleep,
        });
        return results;
    }
    const { results } = await runBatch({
        client,
        requests,
        pollMs,
        sleep,
        onProgress,
        onSubmitted: (batchId) => {
            state.phases[phase] = { batchId };
            saveState();
            log(`${phase}: submitted batch ${batchId}`);
        },
    });
    return results;
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
    resumeState = null,
}) {
    const startedAt = new Date().toISOString();
    const allCases = evalModule.loadCases();
    const cases = limit ? allCases.slice(0, limit) : allCases;
    const configs = pickConfigs(evalModule.configs, configNames);
    const usesModel = typeof evalModule.request === "function";
    const usesJudge = typeof evalModule.judge === "function";
    const batch = (usesModel || usesJudge) && !sync;
    const mode = usesModel ? (batch ? "batch" : "sync") : "local";

    const runId = resumeState?.runId ?? startedAt.replace(/[:.]/g, "-");
    const runDir = path.join(resultsDir, evalName);
    const stateFile = path.join(runDir, `${runId}.state.json`);
    const state = resumeState ?? {
        runId,
        evalName,
        options: { configNames, limit, runs },
        phases: {},
    };
    const saveState = () => {
        fs.mkdirSync(runDir, { recursive: true });
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    };

    // Estimate before anything is sent: the outputs, then the judging.
    let estimateUsd = 0;
    for (const config of Object.values(configs)) {
        for (const testCase of cases) {
            if (usesModel) {
                const e = evalModule.estimate(testCase, config);
                estimateUsd += costOf(e, e.model, { batch }) * runs;
            }
            if (usesJudge) {
                const e = evalModule.estimateJudge(testCase);
                estimateUsd += costOf(e, e.model, { batch }) * runs;
            }
        }
    }
    log(
        `${evalName}: ${cases.length} case(s) x ${Object.keys(configs).length} config(s) x ${runs} run(s), ` +
            `mode ${mode}${usesJudge ? " + judge" : ""}, estimated US$${estimateUsd.toFixed(4)}` +
            (resumeState ? ` (resuming run ${runId})` : ""),
    );

    if (!resumeState) {
        const verdict = checkBudget(estimateUsd, budgetUsd, { yes });
        if (verdict.message) log(verdict.message);
        if (!verdict.ok) return { aborted: true, estimateUsd };
    }

    if ((usesModel || usesJudge) && !client) {
        throw new Error("ANTHROPIC_API_KEY is not set; this eval calls the model.");
    }
    if (batch) {
        saveState();
        log(`state: ${stateFile} (resume with --resume ${runId})`);
    }

    const jobs = [];
    for (const [configName, config] of Object.entries(configs)) {
        for (const testCase of cases) {
            for (let run = 0; run < runs; run++) {
                jobs.push({ id: jobId(configName, testCase.id, run), configName, config, testCase, run });
            }
        }
    }

    // 1. Produce an output for every job.
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
                const message = await client.messages.create(evalModule.request(testCase, config));
                return fromMessage(message, testCase, config);
            },
        });
    } else {
        const byId = await batchPhase({
            client,
            state,
            phase: "produce",
            requests: jobs.map((j) => ({ id: j.id, params: evalModule.request(j.testCase, j.config) })),
            saveState,
            log,
            pollMs,
            sleep,
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

    // 2. Grade every output that exists.
    const caseById = new Map(cases.map((c) => [c.id, c]));
    const gradable = results.filter((r) => !r.error);

    const applyJudgement = (r, message) => {
        r.judgeCostUsd = costOf(message.usage, message.model, { batch });
        r.costUsd = (r.costUsd ?? 0) + r.judgeCostUsd;
        const { scores, judgement } = evalModule.scoreJudgement(message, caseById.get(r.caseId));
        r.scores = scores;
        r.judgement = judgement;
    };

    if (usesJudge && batch) {
        const byId = await batchPhase({
            client,
            state,
            phase: "judge",
            requests: gradable.map((r) => ({
                id: jobId(r.config, r.caseId, r.run),
                params: evalModule.judge(caseById.get(r.caseId), r.output),
            })),
            saveState,
            log,
            pollMs,
            sleep,
        });
        for (const r of gradable) {
            const entry = byId.get(jobId(r.config, r.caseId, r.run));
            if (entry.error) {
                r.error = `judging failed: ${entry.error}`;
                continue;
            }
            try {
                applyJudgement(r, entry.message);
            } catch (error) {
                r.error = `judging failed: ${error.message}`;
            }
        }
    } else if (usesJudge) {
        await runCases({
            cases: gradable.map((r) => ({ id: jobId(r.config, r.caseId, r.run), r })),
            configs: { judge: {} },
            concurrency,
            runOne: async ({ r }) => {
                try {
                    const message = await client.messages.create(evalModule.judge(caseById.get(r.caseId), r.output));
                    applyJudgement(r, message);
                } catch (error) {
                    r.error = `judging failed: ${error.message}`;
                }
                return {};
            },
        });
    } else {
        for (const r of gradable) {
            try {
                r.scores = await evalModule.score(caseById.get(r.caseId), r.output, configs[r.config]);
            } catch (error) {
                r.error = `scoring failed: ${error.message}`;
            }
        }
    }

    const summary = summarise(results);
    log(`\n${formatTable(summary)}\n`);

    const file = writeResults(runDir, {
        eval: evalName,
        runId,
        mode,
        startedAt,
        pricing: { source: SOURCE, checkedOn: CHECKED_ON },
        estimateUsd,
        configs,
        batches: state.phases,
        summary,
        results,
    });
    log(`results: ${file}`);

    return { aborted: false, summary, results, file, estimateUsd, runId };
}

module.exports = { runEval };
