/** Default ceiling for one run, in US dollars. Override with EVAL_BUDGET_USD. */
const DEFAULT_BUDGET_USD = 5;

function budgetFromEnv(env = process.env) {
    const raw = env.EVAL_BUDGET_USD;
    if (raw === undefined || raw === "") return DEFAULT_BUDGET_USD;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`EVAL_BUDGET_USD must be a non-negative number, got "${raw}".`);
    }
    return value;
}

/**
 * Decides, before any API call, whether a run may go ahead. Over budget, it
 * may only proceed when the caller passed `--yes` after seeing the estimate.
 */
function checkBudget(estimateUsd, budgetUsd, { yes = false } = {}) {
    if (estimateUsd <= budgetUsd) return { ok: true };
    if (yes) {
        return {
            ok: true,
            message: `Estimated US$${estimateUsd.toFixed(2)} is over the US$${budgetUsd.toFixed(2)} budget; continuing because --yes was given.`,
        };
    }
    return {
        ok: false,
        message:
            `Estimated cost US$${estimateUsd.toFixed(2)} is over the budget of US$${budgetUsd.toFixed(2)}. ` +
            "Nothing was sent. Use --limit for a smaller trial, raise EVAL_BUDGET_USD, or pass --yes.",
    };
}

module.exports = { DEFAULT_BUDGET_USD, budgetFromEnv, checkBudget };
