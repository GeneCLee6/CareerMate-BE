const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        /** Taken from the opening question so the list is scannable. */
        title: {
            type: String,
            required: true,
            trim: true,
        },
        lastMessageAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        // The frontend reads `id`; without this only `_id` is serialised.
        toJSON: {
            virtuals: true,
            transform: (_, doc) => {
                delete doc._id;
                delete doc.__v;
            },
        },
    },
);

const Conversation = mongoose.model("Conversation", conversationSchema);

module.exports = Conversation;
