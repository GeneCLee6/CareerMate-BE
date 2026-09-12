const jwt = require("jsonwebtoken");
const { signAccessToken, verifyAccessToken } = require("./jwt");
const config = require("./config");

describe("access tokens", () => {
    it("round-trips the payload", () => {
        const token = signAccessToken({ id: "abc123", accountType: "user" });
        const decoded = verifyAccessToken(token);

        expect(decoded.id).toBe("abc123");
        expect(decoded.accountType).toBe("user");
    });

    it("carries an expiry", () => {
        const decoded = verifyAccessToken(signAccessToken({ id: "abc123" }));
        expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });

    it("rejects a token signed with a different secret", () => {
        const forged = jwt.sign({ id: "abc123" }, "not-the-real-secret");
        expect(() => verifyAccessToken(forged)).toThrow();
    });

    it("rejects a tampered payload", () => {
        const token = signAccessToken({ id: "abc123" });
        const [header, , signature] = token.split(".");
        const payload = Buffer.from(JSON.stringify({ id: "admin" })).toString(
            "base64url",
        );

        expect(() =>
            verifyAccessToken(`${header}.${payload}.${signature}`),
        ).toThrow();
    });

    it("rejects an expired token", () => {
        const expired = jwt.sign({ id: "abc123" }, config.JWT_SECRET, {
            expiresIn: "-1s",
        });
        expect(() => verifyAccessToken(expired)).toThrow(jwt.TokenExpiredError);
    });

    it("rejects nonsense", () => {
        expect(() => verifyAccessToken("not-a-token")).toThrow();
    });
});
