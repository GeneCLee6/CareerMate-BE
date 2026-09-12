/**
 * Extracts text for every resume still waiting for it.
 *
 *     npm run backfill:resume-text
 *
 * The chat already does this lazily the first time a resume is used, so this
 * script is not required — it just does the work up front, so the first
 * message after a deploy is not the one that pays for it.
 *
 * Safe to re-run: only resumes at `textStatus: "pending"` are touched.
 */

const mongoose = require("mongoose");
const connectDB = require("../src/utils/db");
const Resume = require("../src/resumes/resume.model");
const { ensureExtracted } = require("../src/resumes/resume.service");

async function main() {
    await connectDB();

    // A resume uploaded before the field existed has no textStatus at all.
    // Mongoose fills the default in when it hydrates the document, so the
    // object looks "pending" — but the query runs in MongoDB, where the field
    // genuinely is not there. Both cases have to be asked for.
    const pending = await Resume.find({
        $or: [{ textStatus: "pending" }, { textStatus: { $exists: false } }],
    }).select("+contentText");
    console.log(`${pending.length} resume(s) waiting for text.\n`);

    const counts = { ok: 0, empty: 0, failed: 0, pending: 0 };

    for (const resume of pending) {
        process.stdout.write(`  ${resume.fileName} ... `);
        await ensureExtracted(resume);
        counts[resume.textStatus] = (counts[resume.textStatus] ?? 0) + 1;
        console.log(
            `${resume.textStatus} (${resume.contentText?.length ?? 0} chars)`,
        );
    }

    console.log(
        `\nok: ${counts.ok}  empty: ${counts.empty}  ` +
            `failed: ${counts.failed}  still pending: ${counts.pending}`,
    );
    if (counts.empty) {
        console.log(
            "\n'empty' means the PDF holds no text — almost always a scan. " +
                "Those stay unreadable until OCR exists; the assistant is told " +
                "to ask the user rather than guess.",
        );
    }

    await mongoose.connection.close();
}

main().catch(async (err) => {
    console.error("Backfill failed:", err.message);
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
});
