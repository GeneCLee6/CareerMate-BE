const {
    PER_MILLION,
    BATCH_MULTIPLIER,
    CACHE_READ_MULTIPLIER,
    CACHE_WRITE_MULTIPLIER,
} = require("../pricing");

/**
 * Estimated US dollars for one response, from its `usage` as the API reports
 * it. Cached input is billed at its own rates, and a batched request at half
 * of everything.
 *
 * An unknown model throws rather than counting as free: a cost of zero would
 * let a run slip past the budget check.
 */
function costOf(usage, model, { batch = false } = {}) {
    const price = PER_MILLION[model];
    if (!price) {
        throw new Error(
            `No price for model "${model}". Add it to evals/pricing.js.`,
        );
    }
    const u = usage ?? {};
    const inputPrice = price.input / 1_000_000;
    const outputPrice = price.output / 1_000_000;

    const dollars =
        (u.input_tokens ?? 0) * inputPrice +
        (u.cache_read_input_tokens ?? 0) * inputPrice * CACHE_READ_MULTIPLIER +
        (u.cache_creation_input_tokens ?? 0) * inputPrice * CACHE_WRITE_MULTIPLIER +
        (u.output_tokens ?? 0) * outputPrice;

    return batch ? dollars * BATCH_MULTIPLIER : dollars;
}

module.exports = { costOf };
