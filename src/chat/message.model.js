const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
    {
        conversation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
            required: true,
            index: true,
        },
        /** Denormalised so a message can be authorised without a join. */
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        role: {
            type: String,
            enum: ["user", "assistant"],
            required: true,
        },
        content: {
            type: String,
            // Not required: a message may be an attachment with nothing typed,
            // which is a reasonable way to open a conversation. The request
            // schema already refuses a message that is empty of both.
            default: "",
        },
        /**
         * What was attached, not the attachment itself. The bytes are used for
         * one request and never stored, so this is only enough for a reloaded
         * transcript to show a chip and for the model to be told that an
         * earlier file is no longer available.
         */
        attachments: [
            {
                _id: false,
                fileName: String,
                mediaType: String,
                kind: { type: String, enum: ["image", "document"] },
            },
        ],
        /** Present on assistant messages; useful for spend reporting. */
        usage: {
            inputTokens: Number,
            outputTokens: Number,
            model: String,
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (_, doc) => {
                delete doc._id;
                delete doc.__v;
            },
        },
    },
);

messageSchema.index({ conversation: 1, createdAt: 1 });

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;
