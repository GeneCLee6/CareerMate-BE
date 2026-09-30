const { z } = require("zod");
const { ISSUE_IDS } = require("./taxonomy");

/**
 * One resume-review test case, stored as
 * `evals/datasets/resume-review/cases/<id>.json`.
 *
 * The schema is checked in `npm test`, which costs nothing, so a malformed
 * case fails there rather than halfway through a paid run.
 */
const plantedIssueSchema = z.object({
    issue: z.enum(ISSUE_IDS),
    // Where in the resume, e.g. "Experience > Acme Pty Ltd, 2nd bullet".
    where: z.string().min(1),
    // Quoted text from the resume that shows the issue, when there is some.
    // Missing links or a missing work-rights line have nothing to quote.
    evidence: z.string().optional(),
});

const caseSchema = z
    .object({
        // Also the file name, so results can be traced back to the file.
        id: z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, digits and hyphens only"),
        // Every case is invented. Real people's resumes never go in the repo.
        source: z.literal("synthetic"),
        persona: z.object({
            targetRole: z.string().min(1),
            location: z.string().min(1),
        }),
        resumeText: z.string().min(400, "a resume shorter than this is not a realistic test"),
        // The same resume rendered as a PDF, next to the JSON (added in e6-t03).
        pdfFile: z.string().regex(/\.pdf$/).optional(),
        plantedIssues: z.array(plantedIssueSchema).min(2).max(4),
        // Who read the case and agreed it is realistic, and when. A generated
        // case is not used in a run until someone has.
        reviewedBy: z.string().nullable(),
        reviewedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    })
    .refine(
        (c) => new Set(c.plantedIssues.map((p) => p.issue)).size === c.plantedIssues.length,
        { message: "each issue may be planted once per resume", path: ["plantedIssues"] },
    )
    .refine((c) => (c.reviewedBy === null) === (c.reviewedOn === null), {
        message: "reviewedBy and reviewedOn go together",
        path: ["reviewedOn"],
    });

/**
 * Validates a parsed case. Throws an Error naming the file and every bad
 * field, so a failure says exactly what to fix.
 */
function validateCase(data, fileName) {
    const result = caseSchema.safeParse(data);
    if (result.success) {
        const expected = `${result.data.id}.json`;
        if (fileName && fileName !== expected) {
            throw new Error(`${fileName}: file name should be ${expected} to match its id`);
        }
        return result.data;
    }
    const problems = result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
    throw new Error(`${fileName ?? "case"}: ${problems}`);
}

module.exports = { caseSchema, validateCase };
