const { z } = require("zod");
const { LIMITS } = require("../utils/limits");

// Trim and lowercase before validating: chained transforms run *after* the
// format check, so a pasted "  Ray@Example.com  " was rejected as malformed.
const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Invalid email format"))
    // Bounded before it reaches an email header or a database index.
    .pipe(z.string().max(LIMITS.EMAIL, "Email address is too long"));
const passwordSchema = z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-zA-Z]/, "Password must have at least one letter")
    .regex(/[0-9]/, "Password must have at least one number");

const registerSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    fullName: z
        .string()
        .trim()
        .min(1, "Full name is required")
        .max(LIMITS.FULL_NAME, `Full name must be ${LIMITS.FULL_NAME} characters or fewer`),
});

const loginSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
});

const forgotPasswordSchema = z.object({
    email: emailSchema,
});

const codeSchema = z
    .string()
    .trim()
    .length(6, "Code must be 6 digits")
    .regex(/^\d{6}$/, "Code must be 6 digits");

const verifyCodeSchema = z.object({
    email: emailSchema,
    code: codeSchema,
});

const verifyEmailSchema = z.object({
    email: emailSchema,
    code: codeSchema,
});

const resendVerificationSchema = z.object({
    email: emailSchema,
});

const resetPasswordSchema = z.object({
    email: emailSchema,
    resetToken: z.string().min(1, "Reset token is required"),
    newPassword: passwordSchema,
});

module.exports = {
    registerSchema,
    loginSchema,
    forgotPasswordSchema,
    verifyCodeSchema,
    verifyEmailSchema,
    resendVerificationSchema,
    resetPasswordSchema,
    passwordSchema,
};
