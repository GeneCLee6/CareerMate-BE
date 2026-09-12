const { PDFParse } = require("pdf-parse");
const logger = require("../utils/logger");

/**
 * How much extracted text is kept on the resume document.
 *
 * A resume is one to three pages, which is well under this. The cap is for the
 * pathological upload — a 10 MB PDF of scanned minutes — so one document
 * cannot become megabytes of text in the database.
 */
const MAX_STORED_CHARS = 20000;

/**
 * How much of it reaches the model, per resume.
 *
 * Lower than what is stored, because this is paid for on **every turn** of a
 * conversation, not once at upload. Two thousand characters is roughly a full
 * page of a resume.
 */
const MAX_PROMPT_CHARS = 6000;

/** Text shorter than this is treated as no text at all — see `extractText`. */
const MIN_USEFUL_CHARS = 30;

/**
 * pdf-parse appends a "-- 1 of 3 --" marker per page. Useful for a human
 * reading a dump, noise in a prompt.
 */
const PAGE_MARKER = /^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gm;

/** Collapses the whitespace a PDF layout leaves behind. */
function tidy(raw) {
    return raw
        .replace(PAGE_MARKER, "")
        // A PDF has no paragraphs, only positioned glyphs, so runs of spaces
        // and blank lines are layout artefacts rather than meaning.
        .replace(/[ \t ]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        .trim();
}

/**
 * Pulls the text out of a PDF.
 *
 * Never throws: extraction is best-effort, and a resume that cannot be read is
 * still a resume the user uploaded. The caller stores the status and the chat
 * falls back to asking the user to paste the relevant section.
 *
 * Returns `status`:
 * - `ok`      — text was found
 * - `empty`   — the file parsed but held no text worth having. Almost always a
 *               scan or an exported image: there are no characters in it, only
 *               a picture of characters
 * - `failed`  — the file could not be parsed at all
 */
async function extractText(buffer) {
    let parser;
    try {
        parser = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        const text = tidy(result.text ?? "");

        if (text.length < MIN_USEFUL_CHARS) {
            return {
                status: "empty",
                text: "",
                pageCount: result.total ?? 0,
                truncated: false,
            };
        }

        return {
            status: "ok",
            text: text.slice(0, MAX_STORED_CHARS),
            pageCount: result.total ?? 0,
            truncated: text.length > MAX_STORED_CHARS,
        };
    } catch (err) {
        // An encrypted, corrupt, or not-really-a-PDF file lands here. It is
        // not a server fault and must not fail the upload.
        logger.warn("Could not extract text from a PDF", {
            message: err.message,
        });
        return { status: "failed", text: "", pageCount: 0, truncated: false };
    } finally {
        await parser?.destroy?.().catch(() => {});
    }
}

/** The slice of stored text that is worth sending to the model. */
function forPrompt(text) {
    if (!text) return "";
    return text.length > MAX_PROMPT_CHARS
        ? `${text.slice(0, MAX_PROMPT_CHARS)}\n[...truncated]`
        : text;
}

module.exports = {
    extractText,
    forPrompt,
    tidy,
    MAX_STORED_CHARS,
    MAX_PROMPT_CHARS,
    MIN_USEFUL_CHARS,
};
