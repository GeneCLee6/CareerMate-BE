/**
 * The no-provider path, in its own file because config is read once when the
 * module graph loads.
 */

// Hoisted so the same spies survive jest.resetModules — a factory that creates
// them inline hands each fresh registry a different set.
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockInfo = jest.fn();

jest.mock("../utils/logger", () => ({
    warn: mockWarn,
    error: mockError,
    info: mockInfo,
}));

/** Loads the service with no provider configured, under the given NODE_ENV. */
function serviceWithEnv(nodeEnv) {
    let service;
    jest.isolateModules(() => {
        jest.doMock("../utils/config", () => ({
            ...jest.requireActual("../utils/config"),
            BREVO_API_KEY: undefined,
            EMAIL_FROM_ADDRESS: undefined,
            NODE_ENV: nodeEnv,
        }));
        service = require("./email.service");
    });
    return service;
}

beforeEach(() => {
    mockWarn.mockClear();
    mockError.mockClear();
});

describe("without a provider configured", () => {
    it("reports itself as unconfigured", () => {
        expect(serviceWithEnv("dev").isConfigured()).toBe(false);
    });

    it("logs the message instead of sending, so the flow can be tested", async () => {
        const service = serviceWithEnv("dev");

        const result = await service.sendVerificationCode({
            to: "ray@example.com",
            name: "Ray",
            code: "134876",
        });

        expect(result).toEqual({ delivered: false, loggedOnly: true });
        expect(mockWarn).toHaveBeenCalled();
        // The code has to reach the log or the dev fallback is useless.
        expect(mockWarn.mock.calls[0][1].text).toContain("134876");
    });

    it("refuses to pretend in production", async () => {
        const service = serviceWithEnv("production");

        await expect(
            service.sendVerificationCode({
                to: "ray@example.com",
                name: "Ray",
                code: "134876",
            }),
        ).rejects.toMatchObject({ status: 503 });
    });

    it("does not log the code in production", async () => {
        const service = serviceWithEnv("production");

        await service
            .sendVerificationCode({
                to: "ray@example.com",
                name: "Ray",
                code: "134876",
            })
            .catch(() => {});

        expect(mockWarn).not.toHaveBeenCalled();
    });
});
