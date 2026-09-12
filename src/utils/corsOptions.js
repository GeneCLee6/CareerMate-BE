const config = require("./config");
const logger = require("./logger");

/** Where the app runs during local development. */
const DEV_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];

/**
 * The origins allowed to call this API.
 *
 * `CORS_ORIGINS` is a comma-separated list. Outside production the local dev
 * server is added, so nobody has to configure anything to work locally.
 */
function allowedOrigins() {
    const configured = (config.CORS_ORIGINS || "")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);

    if (config.NODE_ENV === "production") {
        return configured;
    }
    return [...new Set([...configured, ...DEV_ORIGINS])];
}

/**
 * Options for the `cors` middleware.
 *
 * A request with no `Origin` header is allowed: that is a server-to-server
 * call, curl, or a health check, none of which CORS is meant to govern —
 * CORS protects *browsers*, and a browser always sends the header.
 */
function buildCorsOptions() {
    const origins = allowedOrigins();

    if (config.NODE_ENV === "production" && origins.length === 0) {
        // Loud, because the symptom is otherwise "the deployed frontend gets
        // a CORS error and the backend logs look perfectly healthy".
        logger.error(
            "CORS_ORIGINS is not set in production. Every browser request " +
                "from the frontend will be rejected.",
        );
    }

    return {
        origin(origin, callback) {
            if (!origin || origins.includes(origin)) {
                return callback(null, true);
            }
            // Refuse by not setting the header, rather than by throwing: an
            // error here becomes a 500, which reads as a server fault when it
            // is really a rejected origin.
            return callback(null, false);
        },
        credentials: true,
    };
}

module.exports = { buildCorsOptions, allowedOrigins, DEV_ORIGINS };
