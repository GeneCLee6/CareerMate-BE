const { hashPassword, comparePassword } = require("./password");

// bcrypt at 12 rounds is deliberately slow.
jest.setTimeout(20000);

describe("password hashing", () => {
    it("never stores the password itself", async () => {
        const hash = await hashPassword("Passw0rd123");
        expect(hash).not.toBe("Passw0rd123");
        expect(hash).not.toContain("Passw0rd123");
    });

    it("produces a bcrypt hash", async () => {
        expect(await hashPassword("Passw0rd123")).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    it("salts, so the same password hashes differently each time", async () => {
        const [a, b] = await Promise.all([
            hashPassword("Passw0rd123"),
            hashPassword("Passw0rd123"),
        ]);
        expect(a).not.toBe(b);
    });

    it("accepts the correct password", async () => {
        const hash = await hashPassword("Passw0rd123");
        await expect(comparePassword("Passw0rd123", hash)).resolves.toBe(true);
    });

    it("rejects the wrong password", async () => {
        const hash = await hashPassword("Passw0rd123");
        await expect(comparePassword("Passw0rd124", hash)).resolves.toBe(false);
    });

    it("is case sensitive", async () => {
        const hash = await hashPassword("Passw0rd123");
        await expect(comparePassword("passw0rd123", hash)).resolves.toBe(false);
    });
});
