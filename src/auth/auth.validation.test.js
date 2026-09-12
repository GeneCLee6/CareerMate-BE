const {
    registerSchema,
    loginSchema,
    forgotPasswordSchema,
    verifyCodeSchema,
    resetPasswordSchema,
} = require("./auth.validation");

/** Collects the messages a failed parse produced. */
const errorsOf = (schema, value) => {
    const result = schema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe("registerSchema", () => {
    const valid = {
        fullName: "Ray Zhang",
        email: "ray@example.com",
        password: "Passw0rd123",
    };

    it("accepts a well-formed registration", () => {
        expect(registerSchema.safeParse(valid).success).toBe(true);
    });

    it("lowercases and trims the email", () => {
        const parsed = registerSchema.parse({
            ...valid,
            email: "  Ray@Example.COM  ",
        });
        expect(parsed.email).toBe("ray@example.com");
    });

    it("trims the name", () => {
        expect(registerSchema.parse({ ...valid, fullName: "  Ray  " }).fullName)
            .toBe("Ray");
    });

    it("rejects an empty name", () => {
        expect(errorsOf(registerSchema, { ...valid, fullName: "" })).toContain(
            "Full name is required",
        );
    });

    it.each([
        ["too short", "Pass1"],
        ["no digit", "passwordonly"],
        ["no letter", "12345678"],
    ])("rejects a password that is %s", (_label, password) => {
        expect(registerSchema.safeParse({ ...valid, password }).success).toBe(
            false,
        );
    });

    it("accepts a password of exactly eight characters", () => {
        expect(
            registerSchema.safeParse({ ...valid, password: "abcdefg1" }).success,
        ).toBe(true);
    });

    it("rejects a malformed email", () => {
        expect(
            registerSchema.safeParse({ ...valid, email: "not-an-email" }).success,
        ).toBe(false);
    });
});

describe("loginSchema", () => {
    it("accepts valid credentials", () => {
        expect(
            loginSchema.safeParse({
                email: "ray@example.com",
                password: "Passw0rd123",
            }).success,
        ).toBe(true);
    });

    it("requires both fields", () => {
        expect(loginSchema.safeParse({ email: "ray@example.com" }).success).toBe(
            false,
        );
    });
});

describe("password reset schemas", () => {
    it("forgotPassword takes just an email", () => {
        expect(
            forgotPasswordSchema.safeParse({ email: "ray@example.com" }).success,
        ).toBe(true);
    });

    it("verifyCode requires exactly six characters", () => {
        const base = { email: "ray@example.com" };
        expect(verifyCodeSchema.safeParse({ ...base, code: "134876" }).success)
            .toBe(true);
        expect(verifyCodeSchema.safeParse({ ...base, code: "12345" }).success)
            .toBe(false);
        expect(verifyCodeSchema.safeParse({ ...base, code: "1234567" }).success)
            .toBe(false);
    });

    it("resetPassword needs a token and a strong new password", () => {
        const base = { email: "ray@example.com", resetToken: "abc123" };
        expect(
            resetPasswordSchema.safeParse({ ...base, newPassword: "Passw0rd123" })
                .success,
        ).toBe(true);
        expect(
            resetPasswordSchema.safeParse({ ...base, newPassword: "weak" })
                .success,
        ).toBe(false);
        expect(
            resetPasswordSchema.safeParse({
                email: base.email,
                resetToken: "",
                newPassword: "Passw0rd123",
            }).success,
        ).toBe(false);
    });
});
