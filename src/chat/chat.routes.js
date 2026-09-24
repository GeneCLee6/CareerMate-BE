const express = require("express");
const { validateBody } = require("../middleware/validation.middleware");
const { sendMessageSchema } = require("./chat.validation");
const chatController = require("./chat.controller");

const chatRouter = express.Router();

chatRouter.get("/status", chatController.getStatus);

chatRouter.get("/conversations", chatController.listConversations);
// Declared before "/conversations/:id" so the literal path is not
// swallowed by the parameterised one.
chatRouter.delete("/conversations", chatController.deleteAllConversations);
chatRouter.get("/conversations/:id/messages", chatController.getMessages);
chatRouter.delete("/conversations/:id", chatController.deleteConversation);

// Without an id a new conversation is started.
chatRouter.post(
    "/messages",
    validateBody(sendMessageSchema),
    chatController.sendMessage,
);
chatRouter.post(
    "/conversations/:id/messages",
    validateBody(sendMessageSchema),
    chatController.sendMessage,
);

// The same, with the reply streamed as server-sent events.
chatRouter.post(
    "/messages/stream",
    validateBody(sendMessageSchema),
    chatController.streamMessage,
);
chatRouter.post(
    "/conversations/:id/messages/stream",
    validateBody(sendMessageSchema),
    chatController.streamMessage,
);

module.exports = chatRouter;
