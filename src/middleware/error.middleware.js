const logger = require("../utils/logger");

/**
 * 4xx messages are written for the user and are safe to return. 5xx messages
 * are internal — a Mongoose cast error, for instance, names collections and
 * fields — so they are logged and replaced with something generic.
 */
const errorHandler = (err, req, res, next) => {
    const status = err.status || 500;

    if (status >= 500) {
        logger.error("Unhandled request error", {
            method: req.method,
            path: req.originalUrl,
            status,
            message: err.message,
            stack: err.stack,
        });
    }

    const message =
        status >= 500
            ? "Something unexpected happened"
            : err.message || "Request failed";

    res.status(status).json({
        success: false,
        error: { message },
    });
};

module.exports = errorHandler;
