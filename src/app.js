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
// Chat messages may carry a base64 image, so they need far more headroom than
// anything else. Scoped to that path rather than raised globally: every other
// endpoint takes a small JSON body, and a 12MB limit on all of them would be
// an invitation. This runs before the global parser, which then sees a body
// already parsed and stands aside.
app.use("/v1/chat", express.json({ limit: "12mb" }));
app.use(express.json());

app.use("/v1", v1Router);

app.use(errorHandler);

module.exports = app;
