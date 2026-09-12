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
            required: true,
        },
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
