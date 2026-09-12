const { z } = require("zod");
const { LIMITS } = require("../utils/limits");
const { TMP_KEY_PATTERN } = require("../upload/upload.validation");

const createResumeSchema = z.object({
    fileKey: z.string().regex(TMP_KEY_PATTERN),
    // fileKey: z.string().trim().min(1),
    fileName: z
        .string()
        .trim()
        .min(1)
        .max(LIMITS.FILE_NAME, `File name must be ${LIMITS.FILE_NAME} characters or fewer`),
});

module.exports = {
    createResumeSchema,
};
