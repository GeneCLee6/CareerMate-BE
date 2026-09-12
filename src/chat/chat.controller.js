const Conversation = require("./conversation.model");
const Message = require("./message.model");
const Resume = require("../resumes/resume.model");
const User = require("../users/user.model");
const claudeService = require("./claude.service");
const NotFoundException = require("../exceptions/NotFound.exception");
const { isObjectId } = require("../utils/objectId");
const { prepare } = require("./attachments");
const logger = require("../utils/logger");
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
 * Sends a message and returns Claude's reply.
 *
 * Without `:id` in the path a new conversation is started, so the client does
 * not need a separate call to open one.
 */
const sendMessage = async (req, res) => {
    const userId = req.user.id;
    const { content, attachments } = req.body;

    // Validate and decode before anything is written: a rejected attachment
    // should leave no conversation and no message behind.
    const { blocks, metadata } = await prepare(attachments);

    let conversation;
    if (req.params.id) {
        conversation = await findOwnConversation(req.params.id, userId);
    } else {
        conversation = await Conversation.create({
            user: userId,
            title: titleFrom(content, metadata),
        });
    }

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

    let reply;
    try {
        reply = await claudeService.createReply({
            user,
            resumes,
            history,
            attachmentBlocks: blocks,
        });
    } catch (error) {
        // Don't leave a user turn with no answer hanging in the transcript.
        await Message.deleteOne({ _id: userMessage._id });
        if (!req.params.id) {
            await Conversation.deleteOne({ _id: conversation._id });
        }
        throw error;
    }

    const assistantMessage = await Message.create({
        conversation: conversation._id,
        user: userId,
        role: "assistant",
        content: reply.text,
        usage: reply.usage,
    });

    conversation.lastMessageAt = new Date();
    await conversation.save();

    res.status(201).json({
        success: true,
        data: { conversation, userMessage, assistantMessage },
    });
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
    deleteConversation,
    getStatus,
};
