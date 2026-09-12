const mongoose = require("mongoose");
const app = require("./app");
const config = require("./utils/config");
const logger = require("./utils/logger");
const connectDB = require("./utils/db");

const SHUTDOWN_TIMEOUT = 10 * 1000;

const start = async () => {
    await connectDB();
    const server = app.listen(config.PORT, () => {
        logger.info(`Server listening on port ${config.PORT}`);
    });

    const shutdown = (signal) => {
        logger.info(`${signal} received, shutting down now`);
        server.close(() => {
            mongoose.connection
                .close()
                .then(() => {
                    logger.info("DB connection closed");
                    process.exit(0);
                })
                .catch((err) => {
                    // Still exit: the host is waiting to replace this process.
                    logger.error("Could not close the DB connection", {
                        message: err.message,
                    });
                    process.exit(1);
                });
        });

        const timer = setTimeout(() => {
            logger.error("Shutdown failed");
            process.exit(1);
        }, SHUTDOWN_TIMEOUT);
        // Don't let the deadline itself hold the process open once everything
        // else has finished.
        timer.unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("unhandledRejection", (err) => {
        logger.error("Unhandled rejection", { err });
        process.exit(1);
    });
    process.on("uncaughtException", (err) => {
        logger.error("Unhandled exception", { err });
        process.exit(1);
    });
};

start();
