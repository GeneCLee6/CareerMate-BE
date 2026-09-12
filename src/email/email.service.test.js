jest.mock("../utils/config", () => ({
    ...jest.requireActual("../utils/config"),
    BREVO_API_KEY: "test-key",
    EMAIL_FROM_ADDRESS: "noreply@example.com",
    EMAIL_FROM_NAME: "CareerMate AI",
    NODE_ENV: "test",
}));

jest.mock("../utils/logger", () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
}));

const emailService = require("./email.service");
const logger = require("../utils/logger");

const fetchMock = jest.fn();

const ok = () => ({ ok: true, status: 201, text: async () => "" });
const rejected = (status, body) => ({
    ok: false,
    status,
    text: async () => body,
});

beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    logger.error.mockClear();
    logger.warn.mockClear();
});

describe("isConfigured", () => {
    it("is true when a key and sender are set", () => {
        expect(emailService.isConfigured()).toBe(true);
    });
});

describe("sendVerificationCode", () => {
    it("posts to Brevo with the key and sender", async () => {
        fetchMock.mockResolvedValue(ok());

        await emailService.sendVerificationCode({
            to: "ray@example.com",
            name: "Ray",
            code: "134876",
        });

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toContain("api.brevo.com");
        expect(init.headers["api-key"]).toBe("test-key");

        const body = JSON.parse(init.body);
        expect(body.sender.email).toBe("noreply@example.com");
        expect(body.to).toEqual([{ email: "ray@example.com", name: "Ray" }]);
    });

    it("puts the code in both the HTML and the plain text part", async () => {
        fetchMock.mockResolvedValue(ok());

        await emailService.sendVerificationCode({
            to: "ray@example.com",
            name: "Ray",
            code: "134876",
        });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.htmlContent).toContain("134876");
        expect(body.textContent).toContain("134876");
        expect(body.subject).toMatch(/verify/i);
    });

    it("reports success", async () => {
        fetchMock.mockResolvedValue(ok());
        await expect(
            emailService.sendVerificationCode({
                to: "ray@example.com",
                name: "Ray",
                code: "134876",
            }),
        ).resolves.toEqual({ delivered: true, loggedOnly: false });
    });
});

describe("sendPasswordResetCode", () => {
    it("uses a reset-specific subject", async () => {
        fetchMock.mockResolvedValue(ok());

        await emailService.sendPasswordResetCode({
            to: "ray@example.com",
            name: "Ray",
            code: "998877",
        });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.subject).toMatch(/reset/i);
        expect(body.textContent).toContain("998877");
    });
});

describe("failures", () => {
    it("turns an unreachable provider into a 502", async () => {
        fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

        await expect(
            emailService.send({ to: "a@b.com", subject: "s", html: "h", text: "t" }),
        ).rejects.toMatchObject({ status: 502 });
    });

    it("turns a rejection into a 502 and keeps the detail out of the error", async () => {
        fetchMock.mockResolvedValue(
            rejected(400, '{"message":"Sender not valid","code":"invalid_parameter"}'),
        );

        const error = await emailService
            .send({ to: "a@b.com", subject: "s", html: "h", text: "t" })
            .catch((e) => e);

        expect(error.status).toBe(502);
        // The provider's wording can name the account; it belongs in the log.
        expect(error.message).not.toContain("Sender not valid");
        expect(logger.error).toHaveBeenCalled();
        expect(logger.error.mock.calls[0][1].detail).toContain("Sender not valid");
    });
});
