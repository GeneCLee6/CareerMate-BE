/**
 * The eval harness, with the model mocked: these tests run in `npm test`
 * and cost nothing. The evals themselves are run by hand.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { costOf } = require("./cost");
const { checkBudget, budgetFromEnv, DEFAULT_BUDGET_USD } = require("./budget");
const { runCases } = require("./runCases");
const { runBatch } = require("./batch");
const { summarise, formatTable } = require("./report");
const { runEval } = require("./runEval");
const { parseArgs } = require("../run");
const echo = require("../echo/eval");

const silent = () => {};
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "evals-"));

describe("costOf", () => {
    it("prices input and output per million tokens", () => {
        // Opus 5: $5 in, $25 out.
        expect(costOf({ input_tokens: 1_000_000, output_tokens: 0 }, "claude-opus-5")).toBeCloseTo(5);
        expect(costOf({ input_tokens: 0, output_tokens: 1_000_000 }, "claude-opus-5")).toBeCloseTo(25);
    });

    it("halves everything in a batch", () => {
        const usage = { input_tokens: 2000, output_tokens: 1000 };
        expect(costOf(usage, "claude-sonnet-5", { batch: true })).toBeCloseTo(
            costOf(usage, "claude-sonnet-5") / 2,
        );
    });

    it("prices cached input at its own rates", () => {
        const read = costOf({ cache_read_input_tokens: 1_000_000 }, "claude-opus-5");
        const write = costOf({ cache_creation_input_tokens: 1_000_000 }, "claude-opus-5");
        expect(read).toBeCloseTo(0.5);
        expect(write).toBeCloseTo(6.25);
    });

    it("refuses an unknown model instead of calling it free", () => {
        expect(() => costOf({ input_tokens: 10 }, "claude-imaginary")).toThrow(/No price/);
    });
});

describe("budget", () => {
    it("allows a run within budget", () => {
        expect(checkBudget(1, 5)).toEqual({ ok: true });
    });

    it("stops a run over budget unless --yes", () => {
        expect(checkBudget(6, 5).ok).toBe(false);
        expect(checkBudget(6, 5, { yes: true }).ok).toBe(true);
    });

    it("reads EVAL_BUDGET_USD, defaulting to US$5", () => {
        expect(budgetFromEnv({})).toBe(DEFAULT_BUDGET_USD);
        expect(budgetFromEnv({ EVAL_BUDGET_USD: "12.5" })).toBe(12.5);
        expect(() => budgetFromEnv({ EVAL_BUDGET_USD: "lots" })).toThrow();
    });
});

describe("runCases", () => {
    const cases = [{ id: "a" }, { id: "b" }, { id: "c" }];

    it("runs every case under every config, the requested number of times", async () => {
        const results = await runCases({
            cases,
            configs: { x: {}, y: {} },
            runs: 2,
            runOne: async (c, _cfg, name) => ({ output: `${name}-${c.id}` }),
        });
        expect(results).toHaveLength(12);
        expect(results.filter((r) => r.config === "y" && r.caseId === "b")).toHaveLength(2);
    });

    it("never has more than `concurrency` cases in flight", async () => {
        let inFlight = 0;
        let peak = 0;
        await runCases({
            cases: Array.from({ length: 10 }, (_, i) => ({ id: String(i) })),
            configs: { x: {} },
            concurrency: 3,
            runOne: async () => {
                inFlight++;
                peak = Math.max(peak, inFlight);
                await new Promise((r) => setTimeout(r, 5));
                inFlight--;
                return { output: "" };
            },
        });
        expect(peak).toBe(3);
    });

    it("records one case's failure and carries on with the rest", async () => {
        const results = await runCases({
            cases,
            configs: { x: {} },
            runOne: async (c) => {
                if (c.id === "b") throw new Error("boom");
                return { output: "ok" };
            },
        });
        expect(results.find((r) => r.caseId === "b").error).toBe("boom");
        expect(results.filter((r) => r.output === "ok")).toHaveLength(2);
    });
});

/** A Batches API stand-in: created, polled once, then ended. */
function fakeBatchClient(outcomes) {
    const retrieve = jest
        .fn()
        .mockResolvedValueOnce({ id: "b1", processing_status: "in_progress" })
        .mockResolvedValue({ id: "b1", processing_status: "ended" });
    return {
        messages: {
            batches: {
                create: jest.fn().mockResolvedValue({ id: "b1", processing_status: "in_progress" }),
                retrieve,
                results: jest.fn().mockResolvedValue(
                    (async function* results() {
                        // Deliberately out of order: results are matched on custom_id.
                        for (const o of [...outcomes].reverse()) yield o;
                    })(),
                ),
            },
        },
    };
}

const message = (text) => ({
    content: [{ type: "text", text }],
    model: "claude-sonnet-5",
    usage: { input_tokens: 100, output_tokens: 50 },
});

describe("runBatch", () => {
    it("submits, polls until ended, and matches results by custom_id", async () => {
        const client = fakeBatchClient([
            { custom_id: "one", result: { type: "succeeded", message: message("1") } },
            { custom_id: "two", result: { type: "errored", error: { type: "invalid_request", message: "bad" } } },
        ]);

        const { results } = await runBatch({
            client,
            requests: [
                { id: "one", params: { model: "claude-sonnet-5" } },
                { id: "two", params: { model: "claude-sonnet-5" } },
                { id: "three", params: { model: "claude-sonnet-5" } },
            ],
            sleep: async () => {},
        });

        expect(client.messages.batches.retrieve).toHaveBeenCalledTimes(2);
        expect(results.get("one").message.content[0].text).toBe("1");
        expect(results.get("two").error).toMatch(/invalid_request: bad/);
        expect(results.get("three").error).toBe("no result returned");
    });

    it("refuses beta requests it cannot yet send", async () => {
        await expect(
            runBatch({ client: fakeBatchClient([]), requests: [{ id: "x", params: { betas: ["b"] } }] }),
        ).rejects.toThrow(/--sync/);
    });
});

describe("report", () => {
    it("averages each metric per config and totals the cost", () => {
        const summary = summarise([
            { config: "a", scores: { hit: 1 }, costUsd: 0.01, latencyMs: 1000 },
            { config: "a", scores: { hit: 0 }, costUsd: 0.02, latencyMs: 3000 },
            { config: "a", error: "boom", costUsd: 0 },
        ]);
        expect(summary).toEqual([
            {
                config: "a",
                cases: 3,
                errors: 1,
                metrics: { hit: 0.5 },
                costUsd: 0.03,
                meanLatencyMs: 2000,
            },
        ]);
        expect(formatTable(summary)).toMatch(/a\s+3\s+1\s+0\.500\s+0\.0300\s+2\.00/);
    });
});

describe("runEval", () => {
    it("runs a local eval end to end and writes a results file", async () => {
        const dir = tmpDir();
        const outcome = await runEval({
            evalModule: echo,
            evalName: "echo",
            budgetUsd: 5,
            resultsDir: dir,
            log: silent,
        });

        const byConfig = Object.fromEntries(outcome.summary.map((s) => [s.config, s.metrics.exact]));
        expect(byConfig).toEqual({ upper: 1, lower: 0 });
        const saved = JSON.parse(fs.readFileSync(outcome.file, "utf-8"));
        expect(saved).toMatchObject({ eval: "echo", mode: "local" });
        expect(saved.results).toHaveLength(6);
    });

    it("honours --limit and --configs", async () => {
        const outcome = await runEval({
            evalModule: echo,
            evalName: "echo",
            configNames: ["upper"],
            limit: 2,
            budgetUsd: 5,
            resultsDir: tmpDir(),
            log: silent,
        });
        expect(outcome.results).toHaveLength(2);
        expect(outcome.summary.map((s) => s.config)).toEqual(["upper"]);
    });

    const modelEval = {
        loadCases: () => [{ id: "q1" }, { id: "q2" }],
        configs: { only: { model: "claude-sonnet-5" } },
        request: (c, cfg) => ({ model: cfg.model, max_tokens: 100, messages: [{ role: "user", content: c.id }] }),
        parse: (m) => m.content[0].text,
        estimate: (_c, cfg) => ({ model: cfg.model, input_tokens: 100, output_tokens: 50 }),
        score: (_c, output) => ({ nonEmpty: output ? 1 : 0 }),
    };

    it("sends nothing when the estimate is over budget", async () => {
        const client = { messages: { create: jest.fn(), batches: { create: jest.fn() } } };
        const outcome = await runEval({
            evalModule: modelEval,
            evalName: "m",
            sync: true,
            budgetUsd: 0,
            client,
            resultsDir: tmpDir(),
            log: silent,
        });
        expect(outcome.aborted).toBe(true);
        expect(client.messages.create).not.toHaveBeenCalled();
        expect(client.messages.batches.create).not.toHaveBeenCalled();
    });

    it("calls the model live with --sync and costs each response at full price", async () => {
        const client = { messages: { create: jest.fn().mockResolvedValue(message("hi")) } };
        const outcome = await runEval({
            evalModule: modelEval,
            evalName: "m",
            sync: true,
            budgetUsd: 5,
            client,
            resultsDir: tmpDir(),
            log: silent,
        });
        expect(client.messages.create).toHaveBeenCalledTimes(2);
        // Sonnet 5: 100 in at $2/M + 50 out at $10/M, per response.
        expect(outcome.results[0].costUsd).toBeCloseTo(0.0007);
        expect(outcome.summary[0].metrics.nonEmpty).toBe(1);
    });

    it("uses the Batches API by default, at half price", async () => {
        const client = fakeBatchClient([
            { custom_id: "only__q1__0", result: { type: "succeeded", message: message("a") } },
            { custom_id: "only__q2__0", result: { type: "succeeded", message: message("b") } },
        ]);
        const outcome = await runEval({
            evalModule: modelEval,
            evalName: "m",
            budgetUsd: 5,
            client,
            resultsDir: tmpDir(),
            log: silent,
            sleep: async () => {},
        });
        expect(client.messages.batches.create).toHaveBeenCalledTimes(1);
        expect(outcome.results.map((r) => r.output).sort()).toEqual(["a", "b"]);
        expect(outcome.results[0].costUsd).toBeCloseTo(0.00035);
    });

    it("refuses to call the model without a key", async () => {
        await expect(
            runEval({
                evalModule: modelEval,
                evalName: "m",
                sync: true,
                budgetUsd: 5,
                client: null,
                resultsDir: tmpDir(),
                log: silent,
            }),
        ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    });
});

describe("parseArgs", () => {
    it("reads the eval name and options", () => {
        expect(
            parseArgs(["resume-review", "--configs", "a,b", "--limit", "3", "--runs", "2", "--sync", "--yes"]),
        ).toEqual({
            name: "resume-review",
            configNames: ["a", "b"],
            limit: 3,
            runs: 2,
            sync: true,
            yes: true,
        });
    });

    it("rejects an unknown option", () => {
        expect(() => parseArgs(["echo", "--fast"])).toThrow(/Unknown option/);
    });
});
