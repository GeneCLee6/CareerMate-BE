const express = require("express");
const { validateBody } = require("../middleware/validation.middleware");
const { sendMessageSchema } = require("./chat.validation");
const chatController = require("./chat.controller");

const chatRouter = express.Router();

chatRouter.get("/status", chatController.getStatus);

chatRouter.get("/conversations", chatController.listConversations);
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

module.exports = chatRouter;
