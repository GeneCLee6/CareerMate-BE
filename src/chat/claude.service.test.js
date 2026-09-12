/**
 * The Anthropic SDK is mocked throughout — these tests never spend money or
 * need a key.
 */
const mockCreate = jest.fn();

class MockAPIError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
class MockAuthenticationError extends MockAPIError {}
class MockRateLimitError extends MockAPIError {}
class MockBadRequestError extends MockAPIError {}

jest.mock("@anthropic-ai/sdk", () => {
    const Anthropic = jest.fn().mockImplementation(() => ({
        beta: { messages: { create: mockCreate } },
    }));
    Anthropic.APIError = MockAPIError;
    Anthropic.AuthenticationError = MockAuthenticationError;
    Anthropic.RateLimitError = MockRateLimitError;
    Anthropic.BadRequestError = MockBadRequestError;
    return Anthropic;
});

// config snapshots process.env when it loads, so the key is controlled here
// rather than by setting env vars after the module graph is already built.
jest.mock("../utils/config", () => ({
    ...jest.requireActual("../utils/config"),
    ANTHROPIC_API_KEY: "sk-ant-test",
}));

const claudeService = require("./claude.service");

const reply = (text, extra = {}) => ({
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    model: "claude-opus-5",
    usage: { input_tokens: 10, output_tokens: 20 },
    ...extra,
});

beforeEach(() => {
    mockCreate.mockReset();
});

describe("buildSystemPrompt", () => {
    it("describes the assistant even with nothing known about the user", () => {
        const prompt = claudeService.buildSystemPrompt(null, []);
        expect(prompt).toContain("CareerMate AI");
        expect(prompt).not.toContain("What you know about this user");
    });

    it("includes the profile so the model need not ask for basics", () => {
        const prompt = claudeService.buildSystemPrompt(
            {
                fullName: "Ray Zhang",
                role: "Student",
                field: "FE",
                goal: "Looking for internship",
            },
            [],
        );

        expect(prompt).toContain("Ray Zhang");
        expect(prompt).toContain("Student");
        expect(prompt).toContain("Frontend Development");
        expect(prompt).toContain("Looking for internship");
    });

    it("lists resumes and says their contents are not readable", () => {
        const prompt = claudeService.buildSystemPrompt({ fullName: "Ray" }, [
            { fileName: "cv.pdf" },
        ]);

        expect(prompt).toContain("cv.pdf");
        expect(prompt).toContain("cannot read their contents");
    });

    it("omits fields the user has not filled in", () => {
        const prompt = claudeService.buildSystemPrompt({ fullName: "Ray" }, []);
        expect(prompt).not.toContain("Stated goal");
        expect(prompt).not.toContain("Field:");
    });
});

describe("message mapping", () => {
    it("keeps only role and content, in order", () => {
        const mapped = claudeService.toApiMessages([
            { role: "user", content: "hi", _id: "x", createdAt: "now" },
            { role: "assistant", content: "hello", _id: "y" },
        ]);

        expect(mapped).toEqual([
            { role: "user", content: "hi" },
            { role: "assistant", content: "hello" },
        ]);
    });

    it("joins text blocks and ignores thinking blocks", () => {
        const text = claudeService.extractText([
            { type: "thinking", thinking: "hmm" },
            { type: "text", text: "Hello " },
            { type: "text", text: "there" },
        ]);
        expect(text).toBe("Hello there");
    });
});

describe("createReply", () => {
    const args = {
        user: { fullName: "Ray", field: "FE" },
        resumes: [],
        history: [{ role: "user", content: "How do I prepare?" }],
    };

    it("returns the reply text and usage", async () => {
        mockCreate.mockResolvedValue(reply("Start with the basics."));

        const result = await claudeService.createReply(args);

        expect(result.text).toBe("Start with the basics.");
        expect(result.usage).toEqual({
            inputTokens: 10,
            outputTokens: 20,
            model: "claude-opus-5",
        });
    });

    it("asks for Opus 5 with adaptive thinking and a refusal fallback", async () => {
        mockCreate.mockResolvedValue(reply("ok"));

        await claudeService.createReply(args);

        const request = mockCreate.mock.calls[0][0];
        expect(request.model).toBe("claude-opus-5");
        expect(request.thinking).toEqual({ type: "adaptive" });
        expect(request.fallbacks).toBe("default");
        expect(request.betas).toContain("server-side-fallback-2026-07-01");
        expect(request.max_tokens).toBeGreaterThanOrEqual(4000);
        expect(request.system).toContain("CareerMate AI");
    });

    it("sends the conversation history through", async () => {
        mockCreate.mockResolvedValue(reply("ok"));

        await claudeService.createReply({
            ...args,
            history: [
                { role: "user", content: "one" },
                { role: "assistant", content: "two" },
                { role: "user", content: "three" },
            ],
        });

        expect(mockCreate.mock.calls[0][0].messages).toEqual([
            { role: "user", content: "one" },
            { role: "assistant", content: "two" },
            { role: "user", content: "three" },
        ]);
    });

    it("answers gracefully when the model declines", async () => {
        // A refusal arrives as HTTP 200, so it must be checked before content.
        mockCreate.mockResolvedValue(
            reply("", { stop_reason: "refusal", content: [] }),
        );

        const result = await claudeService.createReply(args);

        expect(result.text).toContain("can't help with that");
    });

    it("falls back to a prompt when the model returns nothing", async () => {
        mockCreate.mockResolvedValue(reply(""));

        const result = await claudeService.createReply(args);

        expect(result.text).toContain("rephrase");
    });

    it("reports a bad key as unconfigured rather than leaking the error", async () => {
        mockCreate.mockRejectedValue(new MockAuthenticationError(401, "bad key"));

        await expect(claudeService.createReply(args)).rejects.toMatchObject({
            status: 503,
        });
    });

    it("passes a rate limit through as 429", async () => {
        mockCreate.mockRejectedValue(new MockRateLimitError(429, "slow down"));

        await expect(claudeService.createReply(args)).rejects.toMatchObject({
            status: 429,
        });
    });

    it("turns an upstream outage into a 502", async () => {
        mockCreate.mockRejectedValue(new MockAPIError(500, "boom"));

        await expect(claudeService.createReply(args)).rejects.toMatchObject({
            status: 502,
        });
    });
});

describe("isConfigured", () => {
    it("is true when a key is configured", () => {
        expect(claudeService.isConfigured()).toBe(true);
    });
});
