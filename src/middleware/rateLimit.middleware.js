const { rateLimit } = require("express-rate-limit");
const config = require("../utils/config");

const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    // Was importing winston's `config`, which has no NODE_ENV — so this read
    // undefined and never skipped, throttling development and tests too.
    skip: () => config.NODE_ENV === "dev" || config.NODE_ENV === "test",
});

module.exports = rateLimiter;
