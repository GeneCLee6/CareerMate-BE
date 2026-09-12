const { z } = require("zod");
const { ALLOWED_TYPES, MAX_ATTACHMENTS } = require("./attachments");

/** Keeps a single turn well under the model's context budget. */
const MAX_MESSAGE_LENGTH = 4000;

const attachmentSchema = z.object({
    fileName: z.string().trim().min(1).max(255),
    mediaType: z.enum(ALLOWED_TYPES),
    /** Base64 without a data: prefix; the client strips it. */
    data: z.string().min(1),
});

const sendMessageSchema = z
    .object({
        // Optional at the type level so a body carrying only attachments is
        // not rejected before the refine below can consider it.
        content: z
            .string()
            .trim()
            .max(
                MAX_MESSAGE_LENGTH,
                `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`,
            )
            .optional()
            .default(""),
        attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
    })
    .refine(
        (body) => body.content.length > 0 || (body.attachments?.length ?? 0) > 0,
        {
            // An attachment on its own is a complete message: dropping a
            // screenshot in and asking nothing is a reasonable way to start.
            message: "Send a message or attach a file",
            path: ["content"],
        },
    );

module.exports = { sendMessageSchema, attachmentSchema, MAX_MESSAGE_LENGTH };
