const BadRequestException = require("../exceptions/badRequest.exception");
const { extractText } = require("../resumes/resumeText");

/**
 * Attachments a chat message may carry.
 *
 * Two kinds, handled quite differently:
 *
 * - **Images** go to the model as vision blocks. Claude reads them directly,
 *   which is the whole point — a screenshot of a job ad or a rejection email
 *   is something the assistant can genuinely discuss.
 * - **PDFs** are turned into text here, reusing the resume extractor, and sent
 *   as text. That keeps one way of reading a PDF in the codebase rather than
 *   two, and a PDF's value in a careers conversation is its words.
 *
 * Nothing is stored. The bytes live for one request; only a filename and type
 * are kept, so a reloaded transcript can still show what was attached. That is
 * a deliberate trade: no per-message storage to pay for, secure, and cheap to
 * reason about — at the cost of the image not being there tomorrow.
 */

const MAX_ATTACHMENTS = 3;

/** Per file, measured after decoding — base64 inflates by about a third. */
const MAX_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const DOCUMENT_TYPES = ["application/pdf"];

const ALLOWED_TYPES = [...IMAGE_TYPES, ...DOCUMENT_TYPES];

/** Decoded size of a base64 payload, without allocating it. */
function decodedBytes(base64) {
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Checks what the client sent and turns it into the blocks the model takes.
 *
 * Returns `{ blocks, metadata }` — blocks for this one request, metadata to
 * store on the message.
 */
async function prepare(attachments = []) {
    if (attachments.length === 0) {
        return { blocks: [], metadata: [] };
    }
    if (attachments.length > MAX_ATTACHMENTS) {
        throw new BadRequestException(
            `You can attach up to ${MAX_ATTACHMENTS} files at once.`,
        );
    }

    const blocks = [];
    const metadata = [];

    for (const attachment of attachments) {
        const { fileName, mediaType, data } = attachment;

        if (!ALLOWED_TYPES.includes(mediaType)) {
            throw new BadRequestException(
                `${fileName} is not a supported type. Attach a PNG, JPEG, WebP, GIF, or PDF.`,
            );
        }
        if (decodedBytes(data) > MAX_BYTES) {
            throw new BadRequestException(
                `${fileName} is larger than ${MAX_BYTES / (1024 * 1024)}MB.`,
            );
        }

        if (IMAGE_TYPES.includes(mediaType)) {
            blocks.push({
                type: "image",
                source: { type: "base64", media_type: mediaType, data },
            });
            metadata.push({ fileName, mediaType, kind: "image" });
            continue;
        }

        // A PDF: read it with the same extractor the resume upload uses.
        const extracted = await extractText(Buffer.from(data, "base64"));
        if (extracted.status !== "ok") {
            throw new BadRequestException(
                `No text could be read from ${fileName}. If it is a scan, ` +
                    "attach a screenshot of the page instead.",
            );
        }
        blocks.push({
            type: "text",
            // Fenced and labelled, for the same reason the resume is: this is
            // a document the user handed over, not an instruction to follow.
            text: `<attachment filename="${fileName}">\n${extracted.text}\n</attachment>`,
        });
        metadata.push({ fileName, mediaType, kind: "document" });
    }

    return { blocks, metadata };
}

/**
 * How an earlier turn's attachment is described when the conversation is
 * replayed. The bytes are gone, so the model is told plainly rather than left
 * to wonder what the user was referring to.
 */
function describeStored(metadata = []) {
    if (metadata.length === 0) return "";
    const names = metadata.map((a) => a.fileName).join(", ");
    return `\n\n[Earlier in this conversation the user attached: ${names}. The file itself is no longer available to you.]`;
}

module.exports = {
    prepare,
    describeStored,
    decodedBytes,
    MAX_ATTACHMENTS,
    MAX_BYTES,
    IMAGE_TYPES,
    DOCUMENT_TYPES,
    ALLOWED_TYPES,
};
