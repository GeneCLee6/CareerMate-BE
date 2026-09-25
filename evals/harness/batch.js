/**
 * Sends requests through the Message Batches API: half price, in exchange for
 * waiting — usually minutes, at most a day. Nobody is waiting on an eval, so
 * it is the default mode.
 *
 * `requests` is [{ id, params }]. Resolves with a Map from id to
 * { message } or { error }. Results come back in any order, so they are
 * matched on `custom_id`, never on position.
 */
async function runBatch({
    client,
    requests,
    pollMs = 30_000,
    onProgress = () => {},
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
    if (requests.some((r) => r.params.betas)) {
        // Beta features go through a different batches endpoint. None of the
        // evals uses one yet; the first that does (e6-t04) adds support.
        throw new Error(
            "Batched requests with `betas` are not supported yet; run with --sync.",
        );
    }

    const created = await client.messages.batches.create({
        requests: requests.map((r) => ({ custom_id: r.id, params: r.params })),
    });

    let batch = created;
    while (batch.processing_status !== "ended") {
        onProgress(batch);
        await sleep(pollMs);
        batch = await client.messages.batches.retrieve(created.id);
    }
    onProgress(batch);

    const byId = new Map();
    for await (const entry of await client.messages.batches.results(created.id)) {
        const { type } = entry.result;
        if (type === "succeeded") {
            byId.set(entry.custom_id, { message: entry.result.message });
        } else if (type === "errored") {
            const error = entry.result.error?.error ?? entry.result.error;
            byId.set(entry.custom_id, {
                error: `${error?.type ?? "error"}: ${error?.message ?? "request failed"}`,
            });
        } else {
            byId.set(entry.custom_id, { error: `batch request ${type}` });
        }
    }
    // A request with no result at all would otherwise vanish from the report.
    for (const r of requests) {
        if (!byId.has(r.id)) byId.set(r.id, { error: "no result returned" });
    }
    return { batchId: created.id, results: byId };
}

module.exports = { runBatch };
