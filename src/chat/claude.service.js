const Anthropic = require("@anthropic-ai/sdk");
const config = require("../utils/config");
const logger = require("../utils/logger");
const AppException = require("../exceptions/app.exception");
const BadRequestException = require("../exceptions/badRequest.exception");

/**
 * Claude Opus 5. Do not downgrade for cost without asking — effort is the
 * tuning lever, and it is set below.
 */
const MODEL = "claude-opus-5";

/**
 * A cap, not a target: unused output tokens cost nothing. Generous enough that
 * a long answer is never truncated mid-sentence.
 */
const MAX_TOKENS = 16000;

/**
 * Careers chat is conversational rather than a hard reasoning problem, so
 * medium effort keeps replies quick and cheap without hurting quality. Raise
 * it if answers start feeling shallow.
 */
const EFFORT = "medium";

let client = null;

/** Built once, lazily, so the app still boots without a key configured. */
function getClient() {
    if (!config.ANTHROPIC_API_KEY) {
        throw new AppException(
            503,
            "The AI assistant is not configured on this server.",
        );
    }
    if (!client) {
        client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    }
    return client;
}

/** True when the server can actually answer chat requests. */
function isConfigured() {
    return Boolean(config.ANTHROPIC_API_KEY);
}

const BASE_PROMPT = [
    "You are CareerMate AI, a careers assistant for students and early-career",
    "engineers. You help with resumes, interview preparation, and career",
    "planning.",
    "",
    "Be specific and practical. Prefer concrete examples and short, scannable",
    "answers over long essays. When you do not know something about the user,",
    "ask rather than assuming. If a question falls outside careers, say so",
    "briefly and steer back.",
].join(" ");

const FIELD_LABELS = { FE: "Frontend Development", BE: "Backend Development" };

/**
 * Grounds the assistant in what we know about the user, so it does not have to
 * ask for basics the profile already answers.
 */
function buildSystemPrompt(user, resumes = []) {
    const facts = [];

    if (user?.fullName) facts.push(`Name: ${user.fullName}`);
    if (user?.role) facts.push(`Role: ${user.role}`);
    if (user?.field) {
        facts.push(`Field: ${FIELD_LABELS[user.field] ?? user.field}`);
    }
    if (user?.goal) facts.push(`Stated goal: ${user.goal}`);

    if (resumes.length > 0) {
        const names = resumes.map((resume) => resume.fileName).join(", ");
        facts.push(
            `Resumes on file: ${names}. You cannot read their contents yet, ` +
                "so ask the user to paste the relevant section when it matters.",
        );
    }

    if (facts.length === 0) {
        return BASE_PROMPT;
    }

    return `${BASE_PROMPT}\n\nWhat you know about this user:\n- ${facts.join("\n- ")}`;
}

/** Maps stored messages onto the shape the Messages API expects. */
function toApiMessages(history) {
    return history.map((message) => ({
        role: message.role,
        content: message.content,
    }));
}

/** Pulls the reply text out of the content blocks. */
function extractText(content) {
    return content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
}

/**
 * Sends the conversation to Claude and returns the reply plus token usage.
 *
 * `history` is the full conversation in order, including the new user message.
 */
async function createReply({ user, resumes, history }) {
    const anthropic = getClient();

    let response;
    try {
        response = await anthropic.beta.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            // Rescue a policy decline on the same call rather than failing.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            thinking: { type: "adaptive" },
            output_config: { effort: EFFORT },
            system: buildSystemPrompt(user, resumes),
            messages: toApiMessages(history),
        });
    } catch (error) {
        // Typed classes, most specific first — never match on message text.
        if (error instanceof Anthropic.AuthenticationError) {
            logger.error("Anthropic rejected the API key");
            throw new AppException(
                503,
                "The AI assistant is not configured correctly.",
            );
        }
        if (error instanceof Anthropic.RateLimitError) {
            throw new AppException(
                429,
                "The assistant is busy right now. Please try again shortly.",
            );
        }
        if (error instanceof Anthropic.BadRequestError) {
            logger.error("Anthropic rejected the request", {
                message: error.message,
            });
            throw new BadRequestException("That message could not be sent.");
        }
        if (error instanceof Anthropic.APIError) {
            logger.error("Anthropic API error", {
                status: error.status,
                message: error.message,
            });
            throw new AppException(
                502,
                "The assistant is unavailable. Please try again.",
            );
        }
        throw error;
    }

    // A refusal is an HTTP 200, so check before reading the content.
    if (response.stop_reason === "refusal") {
        logger.info("Claude declined a chat request", {
            category: response.stop_details?.category ?? null,
        });
        return {
            text: "I can't help with that one. Ask me about your resume, interviews, or career planning and I'll do my best.",
            usage: {
                inputTokens: response.usage?.input_tokens,
                outputTokens: response.usage?.output_tokens,
                model: response.model,
            },
        };
    }

    const text = extractText(response.content);

    return {
        text: text || "Sorry, I didn't catch that. Could you rephrase?",
        usage: {
            inputTokens: response.usage?.input_tokens,
            outputTokens: response.usage?.output_tokens,
            model: response.model,
        },
    };
}

module.exports = {
    createReply,
    isConfigured,
    buildSystemPrompt,
    extractText,
    toApiMessages,
    MODEL,
};
