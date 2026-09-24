const Conversation = require("./conversation.model");
const Message = require("./message.model");
const Resume = require("../resumes/resume.model");
const User = require("../users/user.model");
const claudeService = require("./claude.service");
const NotFoundException = require("../exceptions/NotFound.exception");
const { isObjectId } = require("../utils/objectId");
const { prepare } = require("./attachments");
const logger = require("../utils/logger");
const AppException = require("../exceptions/app.exception");
const { openEventStream } = require("../utils/sse");
const { ensureAllExtracted } = require("../resumes/resume.service");

/** How many earlier turns to replay. Older context is dropped, not summarised. */
const HISTORY_LIMIT = 40;

/**
 * Derives a readable conversation title from the opening question, falling
 * back to the attachment when the message is a file with nothing typed.
 */
function titleFrom(content, attachments = []) {
    const firstLine = content.trim().split("\n")[0];
    if (!firstLine) {
        return attachments[0]?.fileName ?? "New conversation";
    }
    return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

async function findOwnConversation(conversationId, userId) {
    // A malformed id is "not found", not a server error. Without this check
    // findById throws a CastError and the caller sees a 500.
    if (!isObjectId(conversationId)) {
        throw new NotFoundException("Conversation not found");
    }

    const conversation = await Conversation.findById(conversationId);
    // Someone else's conversation is reported as missing rather than
    // forbidden: "forbidden" confirms the id exists, and a conversation id is
    // exactly the kind of thing that should not be probeable.
    if (!conversation || conversation.user.toString() !== userId) {
        throw new NotFoundException("Conversation not found");
    }
    return conversation;
}

const listConversations = async (req, res) => {
    const conversations = await Conversation.find({ user: req.user.id })
        .sort({ lastMessageAt: -1 })
        .limit(50);

    res.json({ success: true, data: conversations });
};

const getMessages = async (req, res) => {
    await findOwnConversation(req.params.id, req.user.id);

    const messages = await Message.find({ conversation: req.params.id }).sort({
        createdAt: 1,
    });

    res.json({ success: true, data: messages });
};

/**
 * Everything before the model is called: validates attachments, opens or
 * finds the conversation, stores the user's message, and gathers what the
 * model will be given.
 *
 * Without `:id` in the path a new conversation is started, so the client does
 * not need a separate call to open one.
 */
async function startTurn(req) {
    const userId = req.user.id;
    const { content, attachments } = req.body;

    // Validate and decode before anything is written: a rejected attachment
    // should leave no conversation and no message behind.
    const { blocks, metadata } = await prepare(attachments);

    const isNewConversation = !req.params.id;
    const conversation = isNewConversation
        ? await Conversation.create({
              user: userId,
              title: titleFrom(content, metadata),
          })
        : await findOwnConversation(req.params.id, userId);

    const userMessage = await Message.create({
        conversation: conversation._id,
        user: userId,
        role: "user",
        content,
        attachments: metadata,
    });

    // Replay the tail of the conversation, oldest first.
    const recent = await Message.find({ conversation: conversation._id })
        .sort({ createdAt: -1 })
        .limit(HISTORY_LIMIT);
    const history = recent.reverse();

    const [user, storedResumes] = await Promise.all([
        User.findById(userId),
        Resume.find({ user: userId }).sort({ createdAt: -1 }).limit(5),
    ]);

    // Resumes uploaded before extraction existed still sit at "pending".
    // Read them the first time they are actually needed, rather than
    // requiring a migration to have been run or the user to re-upload.
    const resumes = await ensureAllExtracted(storedResumes);

    return {
        userId,
        conversation,
        isNewConversation,
        userMessage,
        request: { user, resumes, history, attachmentBlocks: blocks },
    };
}

/** Don't leave a user turn with no answer hanging in the transcript. */
async function rollBackTurn(turn) {
    await Message.deleteOne({ _id: turn.userMessage._id });
    if (turn.isNewConversation) {
        await Conversation.deleteOne({ _id: turn.conversation._id });
    }
}

/** Stores the reply and marks the conversation as recently active. */
async function finishTurn(turn, reply) {
    const assistantMessage = await Message.create({
        conversation: turn.conversation._id,
        user: turn.userId,
        role: "assistant",
        content: reply.text,
        usage: reply.usage,
    });

    turn.conversation.lastMessageAt = new Date();
    await turn.conversation.save();

    return assistantMessage;
}

/** Sends a message and returns Claude's reply in one response. */
const sendMessage = async (req, res) => {
    const turn = await startTurn(req);

    let reply;
    try {
        reply = await claudeService.createReply(turn.request);
    } catch (error) {
        await rollBackTurn(turn);
        throw error;
    }

    const assistantMessage = await finishTurn(turn, reply);

    res.status(201).json({
        success: true,
        data: {
            conversation: turn.conversation,
            userMessage: turn.userMessage,
            assistantMessage,
        },
    });
};

/**
 * What a client may be told about a failure that happened mid-stream.
 * AppException and its subclasses carry a message written for users, as the
 * error middleware assumes; anything else is logged and described generally.
 */
function publicError(error) {
    if (error instanceof AppException) {
        return { status: error.status, message: error.message };
    }
    logger.error("Chat stream failed", { message: error.message, stack: error.stack });
    return { status: 500, message: "Something went wrong. Please try again." };
}

/**
 * Sends a message and streams Claude's reply as server-sent events.
 *
 * Events, in order:
 *
 * - `start`    `{ conversation, userMessage }`: the turn is stored.
 * - `thinking` `{ text }`: a piece of the model's reasoning summary.
 * - `text`     `{ text }`: a piece of the answer.
 * - `done`     `{ conversation, userMessage, assistantMessage }`: the reply
 *   as stored. The client shows this, not the pieces it assembled, so what
 *   was shown is what a reload shows, including when a late refusal
 *   replaced the partial answer.
 * - `error`    `{ status, message }`: the turn failed and was rolled back.
 *
 * Failures that can be known up front (no API key, a bad request, a
 * conversation that is not the caller's) are ordinary JSON errors, because
 * they are checked before the stream opens, while the status is still free.
 */
const streamMessage = async (req, res) => {
    claudeService.assertConfigured();
    const turn = await startTurn(req);

    const stream = openEventStream(res);
    const cancel = new AbortController();
    let settled = false;

    // "close" also fires after a normal end, hence the flag. Before the end,
    // it means the client left: stop the model rather than pay for an answer
    // nobody will read.
    res.on("close", () => {
        if (!settled) cancel.abort();
    });

    stream.send("start", {
        conversation: turn.conversation,
        userMessage: turn.userMessage,
    });

    try {
        const reply = await claudeService.streamReply({
            ...turn.request,
            signal: cancel.signal,
            onThinking: (text) => stream.send("thinking", { text }),
            onText: (text) => stream.send("text", { text }),
        });
        const assistantMessage = await finishTurn(turn, reply);
        settled = true;
        stream.send("done", {
            conversation: turn.conversation,
            userMessage: turn.userMessage,
            assistantMessage,
        });
    } catch (error) {
        settled = true;
        await rollBackTurn(turn);
        if (cancel.signal.aborted) {
            logger.info("Client left before the reply finished", {
                conversation: turn.conversation._id.toString(),
            });
        } else {
            stream.send("error", publicError(error));
        }
    } finally {
        stream.close();
    }
};

const deleteConversation = async (req, res) => {
    const conversation = await findOwnConversation(req.params.id, req.user.id);

    await Message.deleteMany({ conversation: conversation._id });
    await conversation.deleteOne();

    res.sendStatus(204);
};

/**
 * Deletes every conversation the user has.
 *
 * This exists because the assistant screen only ever opens the most recent
 * conversation: everything older is unreachable in the UI, so without a bulk
 * delete a user cannot remove — or even see — most of what is stored about
 * them. For a product that discusses resumes, salaries and rejections, that
 * is not an acceptable place to leave it.
 *
 * Messages go first. If the second call fails, the user is left with empty
 * conversations rather than conversations whose messages are orphaned and
 * invisible.
 */
const deleteAllConversations = async (req, res) => {
    const userId = req.user.id;

    const { deletedCount: messages } = await Message.deleteMany({
        user: userId,
    });
    const { deletedCount: conversations } = await Conversation.deleteMany({
        user: userId,
    });

    logger.info("User deleted their chat history", {
        userId,
        conversations,
        messages,
    });

    res.json({
        success: true,
        data: { conversations, messages },
    });
};

const getStatus = async (req, res) => {
    res.json({ success: true, data: { configured: claudeService.isConfigured() } });
};

module.exports = {
    listConversations,
    deleteAllConversations,
    getMessages,
    sendMessage,
    streamMessage,
    deleteConversation,
    getStatus,
};
