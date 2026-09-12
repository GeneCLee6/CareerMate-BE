const {
    generateCode,
    hashCode,
    compareCode,
    expiryFromNow,
    isExpired,
    cooldownRemaining,
    CODE_LENGTH,
    RESEND_COOLDOWN_MS,
} = require("./verificationCode");

// bcrypt at 12 rounds is deliberately slow.
jest.setTimeout(30000);

describe("generateCode", () => {
    it("is always six digits", () => {
        for (let i = 0; i < 200; i += 1) {
            expect(generateCode()).toMatch(/^\d{6}$/);
        }
    });

    it("can produce codes with leading zeros", () => {
        // The previous implementation, Math.random().toString().slice(2, 8),
        // could yield fewer than six characters. Padding must keep the length.
        const codes = Array.from({ length: 3000 }, generateCode);
        expect(codes.every((c) => c.length === CODE_LENGTH)).toBe(true);
        // With 3000 draws, seeing at least one leading zero is near-certain.
        expect(codes.some((c) => c.startsWith("0"))).toBe(true);
    });

    it("does not repeat trivially", () => {
        const codes = new Set(Array.from({ length: 200 }, generateCode));
        expect(codes.size).toBeGreaterThan(150);
    });
});

describe("hashing", () => {
    it("never stores the code itself", async () => {
        const hash = await hashCode("134876");
        expect(hash).not.toBe("134876");
        expect(hash).not.toContain("134876");
    });

    it("accepts the right code", async () => {
        const hash = await hashCode("134876");
        await expect(compareCode("134876", hash)).resolves.toBe(true);
    });

    it("rejects the wrong code", async () => {
        const hash = await hashCode("134876");
        await expect(compareCode("134875", hash)).resolves.toBe(false);
    });

    it("salts, so the same code hashes differently", async () => {
        const [a, b] = await Promise.all([hashCode("134876"), hashCode("134876")]);
        expect(a).not.toBe(b);
    });

    it("treats a missing stored hash as no match", async () => {
        await expect(compareCode("134876", undefined)).resolves.toBe(false);
        await expect(compareCode("134876", null)).resolves.toBe(false);
    });
});

describe("expiry", () => {
    it("is in the future when freshly issued", () => {
        expect(isExpired(expiryFromNow())).toBe(false);
    });

    it("is expired once the window passes", () => {
        const issued = expiryFromNow(Date.now() - 11 * 60 * 1000);
        expect(isExpired(issued)).toBe(true);
    });

    it("treats a missing expiry as expired", () => {
        expect(isExpired(undefined)).toBe(true);
        expect(isExpired(null)).toBe(true);
    });
});

describe("resend cooldown", () => {
    it("allows the first send", () => {
        expect(cooldownRemaining(undefined)).toBe(0);
    });

    it("blocks immediately after a send", () => {
        expect(cooldownRemaining(new Date())).toBeGreaterThan(0);
    });

    it("allows again once the cooldown passes", () => {
        const past = new Date(Date.now() - RESEND_COOLDOWN_MS - 1000);
        expect(cooldownRemaining(past)).toBe(0);
    });

    it("reports how long is left", () => {
        const halfAgo = Date.now() - RESEND_COOLDOWN_MS / 2;
        const remaining = cooldownRemaining(new Date(halfAgo));
        expect(remaining).toBeGreaterThan(RESEND_COOLDOWN_MS / 2 - 2000);
        expect(remaining).toBeLessThanOrEqual(RESEND_COOLDOWN_MS / 2);
    });
});
