/**
 * The no-API-key path, in its own file because config is read once when the
 * module graph loads — mocking it per-test inside one file fights the registry.
 */
jest.mock("@anthropic-ai/sdk", () => jest.fn());

jest.mock("../utils/config", () => ({
    ...jest.requireActual("../utils/config"),
    ANTHROPIC_API_KEY: undefined,
}));

const claudeService = require("./claude.service");

describe("without an API key", () => {
    it("reports itself as unconfigured", () => {
        expect(claudeService.isConfigured()).toBe(false);
    });

    it("fails with 503 rather than crashing the server", async () => {
        await expect(
            claudeService.createReply({
                user: null,
                resumes: [],
                history: [{ role: "user", content: "hi" }],
            }),
        ).rejects.toMatchObject({ status: 503 });
    });

    it("still builds a system prompt, so the app can boot", () => {
        expect(claudeService.buildSystemPrompt(null, [])).toContain(
            "CareerMate AI",
        );
    });
});
