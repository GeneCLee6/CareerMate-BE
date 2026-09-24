/**
 * Runs `runOne` for every case, under every configuration, `runs` times,
 * with at most `concurrency` in flight at once.
 *
 * A failure in one case is recorded on that case and does not stop the
 * others: a run that dies on its fortieth case wastes the thirty-nine it had
 * already paid for.
 */
async function runCases({ cases, configs, runs = 1, concurrency = 4, runOne }) {
    const jobs = [];
    for (const [configName, config] of Object.entries(configs)) {
        for (const testCase of cases) {
            for (let run = 0; run < runs; run++) {
                jobs.push({ configName, config, testCase, run });
            }
        }
    }

    const results = new Array(jobs.length);
    let next = 0;

    async function worker() {
        while (next < jobs.length) {
            const index = next++;
            const { configName, config, testCase, run } = jobs[index];
            const started = Date.now();
            try {
                const outcome = await runOne(testCase, config, configName);
                results[index] = {
                    caseId: testCase.id,
                    config: configName,
                    run,
                    latencyMs: Date.now() - started,
                    ...outcome,
                };
            } catch (error) {
                results[index] = {
                    caseId: testCase.id,
                    config: configName,
                    run,
                    latencyMs: Date.now() - started,
                    error: error.message,
                };
            }
        }
    }

    const workers = Array.from(
        { length: Math.max(1, Math.min(concurrency, jobs.length)) },
        worker,
    );
    await Promise.all(workers);
    return results;
}

module.exports = { runCases };
