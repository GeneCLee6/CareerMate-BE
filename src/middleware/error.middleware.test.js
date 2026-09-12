const errorHandler = require("./error.middleware");
const logger = require("../utils/logger");

jest.mock("../utils/logger", () => ({ error: jest.fn(), info: jest.fn() }));

function runHandler(err) {
    const req = { method: "DELETE", originalUrl: "/v1/resumes/undefined" };
    const res = {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    errorHandler(err, req, res, jest.fn());
    return res;
}

beforeEach(() => {
    logger.error.mockClear();
});

describe("client errors", () => {
    it("passes a 4xx message through — it is written for the user", () => {
        const res = runHandler({ status: 409, message: "Email already exists!" });

        expect(res.statusCode).toBe(409);
        expect(res.body).toEqual({
            success: false,
            error: { message: "Email already exists!" },
        });
    });

    it("does not log client errors", () => {
        runHandler({ status: 400, message: "Message cannot be empty" });
        expect(logger.error).not.toHaveBeenCalled();
    });

    it("falls back to a generic message when a 4xx has none", () => {
        expect(runHandler({ status: 403 }).body.error.message).toBe(
            "Request failed",
        );
    });
});

describe("server errors", () => {
    // A Mongoose cast error names the collection and the field it failed on.
    const internal = new Error(
        'Cast to ObjectId failed for value "undefined" at path "_id" for model "Resume"',
    );

    it("never returns the internal message to the client", () => {
        const res = runHandler(internal);

        expect(res.statusCode).toBe(500);
        expect(res.body.error.message).toBe("Something unexpected happened");
        expect(res.body.error.message).not.toContain("Resume");
        expect(res.body.error.message).not.toContain("ObjectId");
    });

    it("logs the real error so it can still be diagnosed", () => {
        runHandler(internal);

        expect(logger.error).toHaveBeenCalledTimes(1);
        const [, context] = logger.error.mock.calls[0];
        expect(context.message).toContain("Cast to ObjectId failed");
        expect(context.stack).toBeDefined();
        expect(context.method).toBe("DELETE");
        expect(context.path).toBe("/v1/resumes/undefined");
    });

    it("treats an error with no status as a 500", () => {
        expect(runHandler(new Error("boom")).statusCode).toBe(500);
    });

    it("hides an explicit 502 the same way", () => {
        const res = runHandler({ status: 502, message: "upstream said no" });

        expect(res.body.error.message).toBe("Something unexpected happened");
        expect(logger.error).toHaveBeenCalled();
    });
});
