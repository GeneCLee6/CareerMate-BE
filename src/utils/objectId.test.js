const { isObjectId } = require("./objectId");

describe("isObjectId", () => {
    it("accepts a real 24-character hex id", () => {
        expect(isObjectId("6aa4e7e4de930d08959c9838")).toBe(true);
    });

    it("rejects the shapes that reach us from a URL", () => {
        // Every one of these used to become a Mongoose CastError, which the
        // error middleware could only report as a 500.
        expect(isObjectId("not-an-id")).toBe(false);
        expect(isObjectId("undefined")).toBe(false);
        expect(isObjectId("null")).toBe(false);
        expect(isObjectId("")).toBe(false);
        expect(isObjectId("123")).toBe(false);
    });

    it("rejects a 12-character string, which Mongoose would otherwise accept", () => {
        // ObjectId.isValid() treats any 12-byte string as a valid id, so a
        // word of the right length would slip through a bare isValid check.
        expect(isObjectId("abcdefghijkl")).toBe(false);
    });

    it("rejects a hex string of the wrong length", () => {
        expect(isObjectId("6aa4e7e4de930d08959c983")).toBe(false);
        expect(isObjectId("6aa4e7e4de930d08959c98380")).toBe(false);
    });

    it("rejects values that are not strings", () => {
        expect(isObjectId(undefined)).toBe(false);
        expect(isObjectId(null)).toBe(false);
        expect(isObjectId(123)).toBe(false);
        expect(isObjectId({})).toBe(false);
    });
});
