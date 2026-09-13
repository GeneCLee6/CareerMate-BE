const { z } = require("zod");
const { LIMITS } = require("../utils/limits");
const { ROLES, FIELDS, normaliseCode } = require("./profileOptions");
const { passwordSchema } = require("../auth/auth.validation");
const { TMP_KEY_PATTERN } = require("../upload/upload.validation");

const updateMeSchema = z.object({
    fullName: z
        .string()
        .trim()
        .min(1)
        .max(LIMITS.FULL_NAME, `Full name must be ${LIMITS.FULL_NAME} characters or fewer`),
    displayName: z
        .string()
        .trim()
        .max(LIMITS.DISPLAY_NAME, `Display name must be ${LIMITS.DISPLAY_NAME} characters or fewer`)
        .optional(),
    // Legacy codes are translated before validation rather than rejected: a
    // browser holding a cached bundle keeps sending the old value for as long
    // as that tab is open, and a rename should not become a 400 for someone
    // who did nothing wrong.
    role: z.preprocess(normaliseCode, z.enum(ROLES)).optional(),
    field: z.preprocess(normaliseCode, z.enum(FIELDS)).optional(),
    // Also the length of this field in the AI system prompt.
    goal: z
        .string()
        .trim()
        .max(LIMITS.GOAL, `Goal must be ${LIMITS.GOAL} characters or fewer`)
        .optional(),
});

const updateMyPasswordSchema = z.object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
});

const updateAvatarSchema = z.object({
    fileKey: z.string().regex(TMP_KEY_PATTERN),
});

module.exports = {
    updateMeSchema,
    updateMyPasswordSchema,
    updateAvatarSchema,
};
