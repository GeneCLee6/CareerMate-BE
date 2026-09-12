const helmet = require("helmet");
const express = require("express");
const cors = require("cors");
const morganMiddleware = require("./middleware/morgan.middleware");
const rateLimiter = require("./middleware/rateLimit.middleware");
const v1Router = require("./routes");
const errorHandler = require("./middleware/error.middleware");
const { buildCorsOptions } = require("./utils/corsOptions");

const app = express();
app.use(helmet());
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
    });
});
app.use(morganMiddleware);
// CORS goes before the rate limiter: a browser sends a preflight OPTIONS for
// every non-simple request, and counting those against the limit would halve
// the requests a real user gets.
app.use(cors(buildCorsOptions()));
app.use(rateLimiter);
app.use(express.json());

app.use("/v1", v1Router);

app.use(errorHandler);

module.exports = app;
