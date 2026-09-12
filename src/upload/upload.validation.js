const { z } = require("zod");
const { LIMITS } = require("../utils/limits");
const CATEGORIES = ["avatar", "resume"];
const ALLOWED_TYPES = {
    avatar: ["image/jpeg", "image/png", "image/webp"],
    resume: ["application/pdf"],
};

const MAX_FILE_SIZE = {
    avatar: 5 * 1024 * 1024,
    resume: 10 * 1024 * 1024,
};

const EXTENSION_MAP = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
};

// /{category}/{user id}/ {uuid, random string}
const KEY_PATTERN = /^(avatar|resume)\/[a-f0-9]{24}\/[^/]+$/;
const TMP_KEY_PATTERN = /^tmp\/[a-f0-9]{24}\/[^/]+$/;

const presignedUploadSchema = z.object({
    fileName: z
        .string()
        .trim()
        .min(1)
        .max(LIMITS.FILE_NAME, `File name must be ${LIMITS.FILE_NAME} characters or fewer`),
    contentType: z.string().trim().min(1),
    category: z.enum(CATEGORIES),
    fileSize: z.number().int().positive(),
});

// zod superRefine

module.exports = {
    presignedUploadSchema,
    ALLOWED_TYPES,
    MAX_FILE_SIZE,
    CATEGORIES,
    EXTENSION_MAP,
    TMP_KEY_PATTERN,
};
