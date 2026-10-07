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
    // Beta features are declared once for the whole batch, not per request,
    // and go through the beta batches endpoint. So every request must ask for
    // the same ones, and they are lifted out of each request's parameters.
    const betaSets = new Set(requests.map((r) => JSON.stringify(r.params.betas ?? [])));
    if (betaSets.size > 1) {
        throw new Error("Every request in a batch must use the same `betas`.");
    }
    const betas = requests[0]?.params.betas;
    const api = betas ? client.beta.messages.batches : client.messages.batches;

    const created = await api.create({
        requests: requests.map((r) => {
            const { betas: _ignored, ...params } = r.params;
            return { custom_id: r.id, params };
        }),
        ...(betas ? { betas } : {}),
    });
    onSubmitted(created.id);

    return collectBatch({
        client,
        batchId: created.id,
        ids: requests.map((r) => r.id),
        beta: Boolean(betas),
        pollMs,
        onProgress,
        sleep,
        first: created,
    });
}

/**
 * Waits for an existing batch to end and returns its results, keyed by
 * custom_id. Sends no new requests and costs nothing more. `beta` must match
 * how the batch was created.
 */
async function collectBatch({
    client,
    batchId,
    ids,
    beta = false,
    pollMs = 30_000,
    onProgress = () => {},
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    first,
}) {
    const api = beta ? client.beta.messages.batches : client.messages.batches;
    let batch = first ?? (await api.retrieve(batchId));
    while (batch.processing_status !== "ended") {
        onProgress(batch);
        await sleep(pollMs);
        batch = await api.retrieve(batchId);
    }
    onProgress(batch);

    const byId = new Map();
    for await (const entry of await api.results(batchId)) {
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
