const { z } = require("zod");

/** Keeps a single turn well under the model's context budget. */
const MAX_MESSAGE_LENGTH = 4000;

const sendMessageSchema = z.object({
    content: z
        .string()
        .trim()
        .min(1, "Message cannot be empty")
        .max(
            MAX_MESSAGE_LENGTH,
            `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`,
        ),
});

module.exports = { sendMessageSchema, MAX_MESSAGE_LENGTH };
