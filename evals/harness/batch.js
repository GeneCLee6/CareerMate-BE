/**
 * Sends requests through the Message Batches API: half price, in exchange for
 * waiting — usually minutes, at most a day. Nobody is waiting on an eval, so
 * it is the default mode.
 *
 * `requests` is [{ id, params }]. Resolves with a Map from id to
 * { message } or { error }. Results come back in any order, so they are
 * matched on `custom_id`, never on position.
 *
 * The batch id is reported through `onSubmitted` as soon as it exists. A
 * batch keeps running on the server if this process stops, and is already
 * being paid for, so the id is what lets `collectBatch` fetch the results
 * later instead of paying for the same work twice.
 */
async function runBatch({
    client,
    requests,
    pollMs = 30_000,
    onProgress = () => {},
    onSubmitted = () => {},
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
    onSubmitted(created.id);

    return collectBatch({
        client,
        batchId: created.id,
        ids: requests.map((r) => r.id),
        pollMs,
        onProgress,
        sleep,
        first: created,
    });
}

/**
 * Waits for an existing batch to end and returns its results, keyed by
 * custom_id. Sends no new requests and costs nothing more.
 */
async function collectBatch({
    client,
    batchId,
    ids,
    pollMs = 30_000,
    onProgress = () => {},
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    first,
}) {
    let batch = first ?? (await client.messages.batches.retrieve(batchId));
    while (batch.processing_status !== "ended") {
        onProgress(batch);
        await sleep(pollMs);
        batch = await client.messages.batches.retrieve(batchId);
    }
    onProgress(batch);

    const byId = new Map();
    for await (const entry of await client.messages.batches.results(batchId)) {
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
    for (const id of ids ?? []) {
        if (!byId.has(id)) byId.set(id, { error: "no result returned" });
    }
    return { batchId, results: byId };
}

module.exports = { runBatch, collectBatch };
