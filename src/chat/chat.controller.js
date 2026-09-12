const Conversation = require("./conversation.model");
const Message = require("./message.model");
const Resume = require("../resumes/resume.model");
const User = require("../users/user.model");
const claudeService = require("./claude.service");
const NotFoundException = require("../exceptions/NotFound.exception");
const ForbiddenException = require("../exceptions/forbidden.exception");

/** How many earlier turns to replay. Older context is dropped, not summarised. */
const HISTORY_LIMIT = 40;

/** Derives a readable conversation title from the opening question. */
function titleFrom(content) {
    const firstLine = content.trim().split("\n")[0];
    return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

async function findOwnConversation(conversationId, userId) {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
        throw new NotFoundException("Conversation not found");
    }
    if (conversation.user.toString() !== userId) {
        throw new ForbiddenException("Missing access permission");
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
    const { content } = req.body;

    let conversation;
    if (req.params.id) {
        conversation = await findOwnConversation(req.params.id, userId);
    } else {
        conversation = await Conversation.create({
            user: userId,
            title: titleFrom(content),
        });
    }

    const userMessage = await Message.create({
        conversation: conversation._id,
        user: userId,
        role: "user",
        content,
    });

    // Replay the tail of the conversation, oldest first.
    const recent = await Message.find({ conversation: conversation._id })
        .sort({ createdAt: -1 })
        .limit(HISTORY_LIMIT);
    const history = recent.reverse();

    const [user, resumes] = await Promise.all([
        User.findById(userId),
        Resume.find({ user: userId }).sort({ createdAt: -1 }).limit(5),
    ]);

    let reply;
    try {
        reply = await claudeService.createReply({ user, resumes, history });
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

const getStatus = async (req, res) => {
    res.json({ success: true, data: { configured: claudeService.isConfigured() } });
};

module.exports = {
    listConversations,
    getMessages,
    sendMessage,
    deleteConversation,
    getStatus,
};
