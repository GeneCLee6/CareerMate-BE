const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        fileKey: {
            type: String,
            required: true,
            unique: true,
        },
        fileName: {
            type: String,
            required: true,
        },
        fileSize: {
            type: Number,
            required: true,
        },
        /**
         * Text pulled out of the PDF at upload, so the assistant can actually
         * read the resume rather than only know its filename.
         */
        contentText: {
            type: String,
            default: "",
        },
        /**
         * "ok" when text was found, "empty" for a scan or image-only PDF,
         * "failed" when the file could not be parsed, "pending" before the
         * attempt. The chat wording depends on which.
         */
        textStatus: {
            type: String,
            enum: ["pending", "ok", "empty", "failed"],
            default: "pending",
        },
        pageCount: {
            type: Number,
            default: 0,
        },
        textExtractedAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
        // Without this, documents arrive with _id and no id, which once had the
        // client sending DELETE /resumes/undefined. See ARCHITECTURE.md §4.
        toJSON: { virtuals: true },
    },
);

// The stored text is for the server to put in a prompt; sending it back to the
// client on every list would bloat the response for no one's benefit.
resumeSchema.set("toJSON", {
    virtuals: true,
    transform: (_, resume) => {
        delete resume.contentText;
        delete resume.__v;
        return resume;
    },
});

const Resume = mongoose.model("Resume", resumeSchema);
module.exports = Resume;
