const { getObjectBuffer } = require("../utils/s3");
const logger = require("../utils/logger");
const { extractText } = require("./resumeText");

/**
 * Makes sure a resume's text has been read, extracting it now if it has not.
 *
 * Extraction happens at upload. That covers every resume uploaded since the
 * feature existed and none of the ones uploaded before it — those sit at
 * `textStatus: "pending"` for ever, and the assistant goes on knowing only
 * their filename. A user who had already uploaded their resume saw the feature
 * ship and nothing change, which is exactly how it was reported.
 *
 * So the read is also lazy: the first time an old resume is needed, it is
 * extracted and saved. It costs one download on one message, once per resume,
 * and it needs no migration to have been run.
 *
 * Never throws. A resume that cannot be read is still a resume the user
 * uploaded, and the prompt has a branch for exactly that.
 */
async function ensureExtracted(resume) {
    if (!resume || resume.textStatus !== "pending") {
        return resume;
    }

    try {
        const extracted = await extractText(await getObjectBuffer(resume.fileKey));

        resume.contentText = extracted.text;
        resume.textStatus = extracted.status;
        resume.pageCount = extracted.pageCount;
        resume.textExtractedAt = new Date();
        await resume.save();

        logger.info("Extracted text from a resume on first use", {
            resumeId: resume._id,
            status: extracted.status,
        });
    } catch (err) {
        // Leave it pending so the next attempt can succeed — a transient S3
        // failure should not permanently mark a readable resume unreadable.
        logger.warn("Could not extract a resume's text on demand", {
            resumeId: resume._id,
            message: err.message,
        });
    }

    return resume;
}

/** Same, for the handful of resumes a conversation loads. */
function ensureAllExtracted(resumes = []) {
    return Promise.all(resumes.map(ensureExtracted));
}

module.exports = { ensureExtracted, ensureAllExtracted };
