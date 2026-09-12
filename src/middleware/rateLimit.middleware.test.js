/**
 * The bug this guards: the module imported `config` from winston, whose config
 * object has no NODE_ENV, so `skip()` read undefined and always returned false
 * — the limiter throttled development and the test suite too.
 */
const capturedOptions = {};

jest.mock("express-rate-limit", () => ({
    rateLimit: jest.fn((options) => {
        Object.assign(capturedOptions, options);
        return function middleware() {};
    }),
}));

/** Loads the middleware with NODE_ENV set to `env`. */
function skipFnFor(env) {
    let skip;
    jest.isolateModules(() => {
        jest.doMock("../utils/config", () => ({
            ...jest.requireActual("../utils/config"),
            NODE_ENV: env,
        }));
        require("./rateLimit.middleware");
        skip = capturedOptions.skip;
    });
    return skip;
}

describe("rate limiter", () => {
    it("skips in development", () => {
        expect(skipFnFor("dev")()).toBe(true);
    });

    it("skips in test", () => {
        expect(skipFnFor("test")()).toBe(true);
    });

    it("applies in production", () => {
        expect(skipFnFor("production")()).toBe(false);
    });

    it("uses the app's config, not winston's", () => {
        // winston.config has no NODE_ENV; reading it would make every
        // environment look like production.
        const winston = require("winston");
        expect(winston.config.NODE_ENV).toBeUndefined();
        expect(skipFnFor("dev")()).toBe(true);
    });

    it("keeps a window and a limit", () => {
        skipFnFor("production");
        expect(capturedOptions.windowMs).toBe(15 * 60 * 1000);
        expect(capturedOptions.limit).toBe(100);
    });
});
