const mockGetObjectBuffer = jest.fn();
const mockExtractText = jest.fn();

jest.mock("../utils/s3", () => ({ getObjectBuffer: mockGetObjectBuffer }));
jest.mock("./resumeText", () => ({ extractText: mockExtractText }));
jest.mock("../utils/logger", () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const { ensureExtracted, ensureAllExtracted } = require("./resume.service");

/** A stand-in for a Mongoose document, with a save() we can assert on. */
function resumeDoc(overrides = {}) {
    return {
        _id: "r1",
        fileKey: "resume/u1/cv.pdf",
        fileName: "cv.pdf",
        contentText: "",
        textStatus: "pending",
        pageCount: 0,
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetObjectBuffer.mockResolvedValue(Buffer.from("pdf bytes"));
    mockExtractText.mockResolvedValue({
        status: "ok",
        text: "Ray Zhang — Frontend Engineer",
        pageCount: 2,
        truncated: false,
    });
});

describe("ensureExtracted", () => {
    it("reads a resume that predates extraction and saves the result", async () => {
        // The gap this closes: extraction ran at upload only, so resumes
        // already in the database stayed unreadable for ever and the user saw
        // the feature ship with nothing changing.
        const resume = resumeDoc();

        await ensureExtracted(resume);

        expect(mockGetObjectBuffer).toHaveBeenCalledWith("resume/u1/cv.pdf");
        expect(resume.contentText).toBe("Ray Zhang — Frontend Engineer");
        expect(resume.textStatus).toBe("ok");
        expect(resume.pageCount).toBe(2);
        expect(resume.textExtractedAt).toBeInstanceOf(Date);
        expect(resume.save).toHaveBeenCalled();
    });

    it("leaves an already-read resume alone", async () => {
        const resume = resumeDoc({ textStatus: "ok", contentText: "already here" });

        await ensureExtracted(resume);

        expect(mockGetObjectBuffer).not.toHaveBeenCalled();
        expect(resume.save).not.toHaveBeenCalled();
        expect(resume.contentText).toBe("already here");
    });

    it("does not retry a file already known to be unreadable", async () => {
        // A scan will not become readable on the second attempt, and every
        // message would pay for the download.
        for (const textStatus of ["empty", "failed"]) {
            const resume = resumeDoc({ textStatus });
            await ensureExtracted(resume);
            expect(mockGetObjectBuffer).not.toHaveBeenCalled();
        }
    });

    it("records a scan as empty rather than leaving it pending", async () => {
        mockExtractText.mockResolvedValue({
            status: "empty",
            text: "",
            pageCount: 1,
        });
        const resume = resumeDoc();

        await ensureExtracted(resume);

        expect(resume.textStatus).toBe("empty");
        expect(resume.save).toHaveBeenCalled();
    });

    it("leaves it pending when storage cannot be reached", async () => {
        // A transient S3 failure must not permanently mark a readable resume
        // unreadable — the next message should try again.
        mockGetObjectBuffer.mockRejectedValue(new Error("network down"));
        const resume = resumeDoc();

        await ensureExtracted(resume);

        expect(resume.textStatus).toBe("pending");
        expect(resume.save).not.toHaveBeenCalled();
    });

    it("never throws, whatever happens", async () => {
        mockGetObjectBuffer.mockRejectedValue(new Error("boom"));
        await expect(ensureExtracted(resumeDoc())).resolves.toBeDefined();
    });

    it("tolerates being handed nothing", async () => {
        await expect(ensureExtracted(undefined)).resolves.toBeUndefined();
    });
});

describe("ensureAllExtracted", () => {
    it("handles a mix, touching only what needs it", async () => {
        const pending = resumeDoc({ _id: "a" });
        const done = resumeDoc({ _id: "b", textStatus: "ok" });

        const result = await ensureAllExtracted([pending, done]);

        expect(result).toHaveLength(2);
        expect(mockGetObjectBuffer).toHaveBeenCalledTimes(1);
    });

    it("copes with no resumes at all", async () => {
        await expect(ensureAllExtracted()).resolves.toEqual([]);
        await expect(ensureAllExtracted([])).resolves.toEqual([]);
    });
});
