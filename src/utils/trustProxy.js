/**
 * Decides Express's "trust proxy" setting.
 *
 * Behind a hosting platform's load balancer every request arrives from the
 * balancer's address, with the real client in X-Forwarded-For. Without trust
 * proxy, `req.ip` is the balancer, so the rate limiter puts every user in one
 * bucket and a handful of people lock each other out. Trusting the header
 * unconditionally is the opposite mistake: a client could send its own
 * X-Forwarded-For and pick a fresh identity on every request.
 *
 * So the default is one hop in production, which is what Render and similar
 * platforms put in front of the app, and nothing elsewhere. TRUST_PROXY
 * overrides it when the topology differs: a hop count, "false", or any value
 * Express accepts such as "loopback".
 */
function resolveTrustProxy(value, nodeEnv) {
    if (value === undefined || value.trim() === "") {
        return nodeEnv === "production" ? 1 : false;
    }
    const trimmed = value.trim();
    if (trimmed === "false") return false;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    return trimmed;
}

module.exports = { resolveTrustProxy };
