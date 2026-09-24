/**
 * Prices used to estimate and report what an eval costs.
 *
 * Copied by hand from the pricing page below on the date given. Prices change;
 * check the page before trusting a number here, and update both the table
 * and the date together. Every cost an eval reports is an estimate from this
 * table, not a figure from the bill.
 */
const SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";
const CHECKED_ON = "2026-09-24";

/** US dollars per million tokens, standard (non-batch) rates. */
const PER_MILLION = {
    "claude-opus-5": { input: 5, output: 25 },
    "claude-sonnet-5": { input: 2, output: 10 },
    "claude-haiku-4-5": { input: 1, output: 5 },
};

/** The Message Batches API halves every token price. */
const BATCH_MULTIPLIER = 0.5;

/** Prompt caching, relative to the input price. */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25; // 5-minute cache

module.exports = {
    SOURCE,
    CHECKED_ON,
    PER_MILLION,
    BATCH_MULTIPLIER,
    CACHE_READ_MULTIPLIER,
    CACHE_WRITE_MULTIPLIER,
};
