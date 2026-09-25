const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const mean = (values) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

/**
 * One row per configuration: how many cases ran, how many failed, the mean
 * of every metric the eval scored, total estimated cost and mean latency.
 */
function summarise(results) {
    const byConfig = new Map();
    for (const r of results) {
        if (!byConfig.has(r.config)) byConfig.set(r.config, []);
        byConfig.get(r.config).push(r);
    }

    return [...byConfig.entries()].map(([config, rows]) => {
        const ok = rows.filter((r) => !r.error);
        const metricNames = [...new Set(ok.flatMap((r) => Object.keys(r.scores ?? {})))];
        const metrics = Object.fromEntries(
            metricNames.map((name) => [
                name,
                mean(ok.map((r) => r.scores?.[name]).filter((v) => typeof v === "number")),
            ]),
        );
        const latencies = ok.map((r) => r.latencyMs).filter((v) => typeof v === "number");
        return {
            config,
            cases: rows.length,
            errors: rows.length - ok.length,
            metrics,
            costUsd: rows.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
            meanLatencyMs: mean(latencies),
        };
    });
}

/** A plain-text table, so a result can be pasted into a pull request. */
function formatTable(summary) {
    const metricNames = [...new Set(summary.flatMap((s) => Object.keys(s.metrics)))];
    const header = ["config", "cases", "errors", ...metricNames, "cost (US$)", "latency (s)"];
    const rows = summary.map((s) => [
        s.config,
        String(s.cases),
        String(s.errors),
        ...metricNames.map((m) => (s.metrics[m] == null ? "-" : s.metrics[m].toFixed(3))),
        s.costUsd.toFixed(4),
        s.meanLatencyMs == null ? "-" : (s.meanLatencyMs / 1000).toFixed(2),
    ]);
    const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
    const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
    return [line(header), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

function gitCommit() {
    try {
        return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
            .toString()
            .trim();
    } catch {
        return null;
    }
}

/**
 * Writes the full run to evals/results/<eval>/<timestamp>.json. Everything
 * needed to understand it later — commit, configurations, every output — is
 * in the file, so an old result does not depend on the old code.
 */
function writeResults(dir, payload) {
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(dir, `${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify({ commit: gitCommit(), ...payload }, null, 2));
    return file;
}

module.exports = { summarise, formatTable, writeResults };
