const { resolveTrustProxy } = require("./trustProxy");

describe("resolveTrustProxy", () => {
    it("trusts one hop in production by default", () => {
        expect(resolveTrustProxy(undefined, "production")).toBe(1);
    });

    it("trusts nothing outside production by default", () => {
        expect(resolveTrustProxy(undefined, "dev")).toBe(false);
        expect(resolveTrustProxy(undefined, "test")).toBe(false);
    });

    it("treats an empty value as unset", () => {
        expect(resolveTrustProxy("  ", "production")).toBe(1);
    });

    it("reads a hop count as a number", () => {
        expect(resolveTrustProxy("2", "production")).toBe(2);
        expect(resolveTrustProxy("0", "production")).toBe(0);
    });

    it("lets production opt out", () => {
        expect(resolveTrustProxy("false", "production")).toBe(false);
    });

    it("passes other values through for Express to interpret", () => {
        expect(resolveTrustProxy(" loopback ", "dev")).toBe("loopback");
    });
});
