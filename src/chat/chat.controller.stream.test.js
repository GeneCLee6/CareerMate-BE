/**
 * streamMessage with the database, the model and the network all mocked.
 * What is under test is the controller's contract: the order of events,
 * rollback on failure, and cancelling the model when the client leaves.
 */
const { EventEmitter } = require("events");

const mockConversationCreate = jest.fn();
const mockConversationDeleteOne = jest.fn();
const mockMessageCreate = jest.fn();
const mockMessageDeleteOne = jest.fn();
const mockStreamReply = jest.fn();
const mockAssertConfigured = jest.fn();

jest.mock("./conversation.model", () => ({
    create: (...args) => mockConversationCreate(...args),
    deleteOne: (...args) => mockConversationDeleteOne(...args),
    findById: jest.fn(),
}));
jest.mock("./message.model", () => ({
    create: (...args) => mockMessageCreate(...args),
    deleteOne: (...args) => mockMessageDeleteOne(...args),
    // Message.find(...).sort(...).limit(...) resolves to the history.
    find: () => ({
        sort: () => ({ limit: async () => [{ role: "user", content: "Hi" }] }),
    }),
}));
jest.mock("../users/user.model", () => ({ findById: async () => ({ fullName: "Gene" }) }));
jest.mock("../resumes/resume.model", () => ({
    find: () => ({ sort: () => ({ limit: async () => [] }) }),
}));
jest.mock("../resumes/resume.service", () => ({ ensureAllExtracted: async (r) => r }));
jest.mock("./attachments", () => ({
    prepare: async () => ({ blocks: [], metadata: [] }),
    describeStored: () => "",
}));
jest.mock("./claude.service", () => ({
    streamReply: (...args) => mockStreamReply(...args),
    assertConfigured: (...args) => mockAssertConfigured(...args),
}));
jest.mock("../utils/logger", () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const AppException = require("../exceptions/app.exception");
const { streamMessage } = require("./chat.controller");

/** A response that records SSE events; `close` can be emitted by a test. */
function fakeResponse() {
    const res = new EventEmitter();
    res.written = "";
    res.writableEnded = false;
    res.status = jest.fn(() => res);
    res.setHeader = jest.fn();
    res.flushHeaders = jest.fn();
    res.write = jest.fn((chunk) => {
        res.written += chunk;
    });
    res.end = jest.fn(() => {
        res.writableEnded = true;
        res.emit("close");
    });
    return res;
}

/** The events written so far, as [name, data] pairs. */
function events(res) {
    return res.written
        .split("\n\n")
        .filter((block) => block.startsWith("event:"))
        .map((block) => {
            const [eventLine, dataLine] = block.split("\n");
            return [eventLine.slice(7), JSON.parse(dataLine.slice(6))];
        });
}

const conversation = {
    _id: { toString: () => "conv1" },
    lastMessageAt: null,
    save: jest.fn(),
};
const userMessage = { _id: "msg-user", role: "user", content: "Hi" };
const assistantMessage = { _id: "msg-ai", role: "assistant", content: "Hello there." };

function request() {
    return { user: { id: "user1" }, body: { content: "Hi" }, params: {} };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockConversationCreate.mockResolvedValue(conversation);
    mockMessageCreate.mockImplementation(async ({ role }) =>
        role === "user" ? userMessage : assistantMessage,
    );
});

describe("streamMessage", () => {
    it("streams start, thinking, text and done, and stores the reply", async () => {
        mockStreamReply.mockImplementation(async ({ onThinking, onText }) => {
            onThinking("Considering the resume.");
            onText("Hello ");
            onText("there.");
            return { text: "Hello there.", usage: {}, refused: false };
        });
        const res = fakeResponse();

        await streamMessage(request(), res);

        expect(events(res).map(([name]) => name)).toEqual([
            "start",
            "thinking",
            "text",
            "text",
            "done",
        ]);
        expect(events(res)[1][1]).toEqual({ text: "Considering the resume." });
        expect(events(res)[4][1].assistantMessage).toEqual(assistantMessage);
        expect(mockMessageCreate).toHaveBeenCalledWith(
            expect.objectContaining({ role: "assistant", content: "Hello there." }),
        );
        expect(res.end).toHaveBeenCalled();
    });

    it("rolls the turn back and reports the error when the model fails", async () => {
        mockStreamReply.mockImplementation(async ({ onText }) => {
            onText("Half an ans");
            throw new AppException(502, "The assistant is unavailable. Please try again.");
        });
        const res = fakeResponse();

        await streamMessage(request(), res);

        const last = events(res).at(-1);
        expect(last).toEqual([
            "error",
            { status: 502, message: "The assistant is unavailable. Please try again." },
        ]);
        expect(mockMessageDeleteOne).toHaveBeenCalledWith({ _id: "msg-user" });
        expect(mockConversationDeleteOne).toHaveBeenCalledWith({ _id: conversation._id });
        expect(mockMessageCreate).not.toHaveBeenCalledWith(
            expect.objectContaining({ role: "assistant" }),
        );
    });

    it("does not leak the details of an unexpected error", async () => {
        mockStreamReply.mockRejectedValue(new Error("Mongo timeout at 10.0.0.3"));
        const res = fakeResponse();

        await streamMessage(request(), res);

        expect(events(res).at(-1)).toEqual([
            "error",
            { status: 500, message: "Something went wrong. Please try again." },
        ]);
    });

    it("cancels the model and rolls back when the client leaves", async () => {
        const res = fakeResponse();
        mockStreamReply.mockImplementation(({ signal }) => {
            // The client disconnects while the reply is being written.
            res.emit("close");
            expect(signal.aborted).toBe(true);
            const abort = new Error("Request was aborted.");
            return Promise.reject(abort);
        });

        await streamMessage(request(), res);

        expect(mockMessageDeleteOne).toHaveBeenCalledWith({ _id: "msg-user" });
        expect(events(res).map(([name]) => name)).toEqual(["start"]);
    });

    it("keeps an existing conversation when rolling back a turn in it", async () => {
        const Conversation = require("./conversation.model");
        Conversation.findById.mockResolvedValue({
            ...conversation,
            user: { toString: () => "user1" },
        });
        mockStreamReply.mockRejectedValue(new AppException(429, "Busy"));
        const req = { ...request(), params: { id: "64b7f0c2a1b2c3d4e5f60718" } };

        await streamMessage(req, fakeResponse());

        expect(mockMessageDeleteOne).toHaveBeenCalled();
        expect(mockConversationDeleteOne).not.toHaveBeenCalled();
    });

    it("refuses before opening the stream when the assistant is not configured", async () => {
        mockAssertConfigured.mockImplementation(() => {
            throw new AppException(503, "The AI assistant is not configured on this server.");
        });
        const res = fakeResponse();

        await expect(streamMessage(request(), res)).rejects.toMatchObject({ status: 503 });

        expect(res.flushHeaders).not.toHaveBeenCalled();
        expect(mockMessageCreate).not.toHaveBeenCalled();
    });
});
