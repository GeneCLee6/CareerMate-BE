const { z } = require("zod");

// Trim and lowercase before validating: chained transforms run *after* the
// format check, so a pasted "  Ray@Example.com  " was rejected as malformed.
const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Invalid email format"));
const passwordSchema = z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-zA-Z]/, "Password must have at least one letter")
    .regex(/[0-9]/, "Password must have at least one number");

const registerSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    fullName: z.string().min(1, "Full name is required").trim(),
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
