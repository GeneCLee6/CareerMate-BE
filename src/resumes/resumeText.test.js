jest.mock("../utils/logger", () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
}));

const {
    extractText,
    forPrompt,
    tidy,
    MAX_STORED_CHARS,
    MAX_PROMPT_CHARS,
} = require("./resumeText");

/** Builds a genuinely valid one-page PDF containing the given lines. */
function buildPdf(lines) {
    const content =
        "BT /F1 14 Tf 72 720 Td 18 TL\n" +
        lines
            .map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj T*`)
            .join("\n") +
        "\nET";

    const objects = [
        "<</Type/Catalog/Pages 2 0 R>>",
        "<</Type/Pages/Kids[3 0 R]/Count 1>>",
        "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R" +
            "/Resources<</Font<</F1 5 0 R>>>>>>",
        `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
        "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [];
    objects.forEach((body, i) => {
        offsets.push(pdf.length);
        pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefStart = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
        pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\n`;
    pdf += `startxref\n${xrefStart}\n%%EOF\n`;
    return Buffer.from(pdf, "latin1");
}

const RESUME_LINES = [
    "Ray Zhang - Frontend Engineer",
    "Melbourne, Australia | ray@example.com",
    "EXPERIENCE",
    "Junior Developer, Acme Pty Ltd, 2024-2026",
    "Built a React dashboard used by 200 staff.",
    "SKILLS",
    "React, TypeScript, Node.js",
];

describe("extractText", () => {
    it("reads the text out of a real PDF", async () => {
        const result = await extractText(buildPdf(RESUME_LINES));

        expect(result.status).toBe("ok");
        expect(result.text).toContain("Ray Zhang - Frontend Engineer");
        expect(result.text).toContain("Junior Developer, Acme Pty Ltd");
        expect(result.text).toContain("React, TypeScript, Node.js");
        expect(result.pageCount).toBe(1);
    });

    it("strips the per-page markers the parser adds", async () => {
        const result = await extractText(buildPdf(RESUME_LINES));
        // "-- 1 of 1 --" is useful in a dump and noise in a prompt.
        expect(result.text).not.toMatch(/--\s*\d+\s+of\s+\d+\s*--/);
    });

    it("reports a scan as empty rather than as text", async () => {
        // A PDF that parses but holds no characters — an image-only scan. It
        // must not look like a successful read, or the assistant would claim
        // to have read a resume it cannot see.
        const result = await extractText(buildPdf([""]));
        expect(result.status).toBe("empty");
        expect(result.text).toBe("");
    });

    it("reports a corrupt file as failed instead of throwing", async () => {
        // Upload already succeeded by this point; a parse failure must not
        // take the request down with it.
        const result = await extractText(Buffer.from("this is not a pdf"));
        expect(result.status).toBe("failed");
        expect(result.text).toBe("");
    });

    it("survives an empty buffer", async () => {
        const result = await extractText(Buffer.alloc(0));
        expect(result.status).toBe("failed");
    });

    it("caps what it stores", async () => {
        const long = Array.from({ length: 4000 }, (_, i) => `Line ${i} of work history`);
        const result = await extractText(buildPdf(long));
        expect(result.text.length).toBeLessThanOrEqual(MAX_STORED_CHARS);
    });
});

describe("tidy", () => {
    it("collapses the whitespace a PDF layout leaves behind", () => {
        expect(tidy("A    B\n\n\n\nC   ")).toBe("A B\n\nC");
    });

    it("removes page markers wherever they appear", () => {
        expect(tidy("First page\n-- 1 of 2 --\nSecond page")).toBe(
            "First page\n\nSecond page"
        );
    });
});

describe("forPrompt", () => {
    it("passes a normal resume through untouched", () => {
        const text = "Ray Zhang\nFrontend Engineer";
        expect(forPrompt(text)).toBe(text);
    });

    it("truncates and says so, rather than cutting silently", () => {
        // Silent truncation would have the model confidently discuss a
        // resume whose second half it never saw.
        const result = forPrompt("x".repeat(MAX_PROMPT_CHARS + 500));
        expect(result).toContain("[...truncated]");
        expect(result.length).toBeLessThan(MAX_PROMPT_CHARS + 100);
    });

    it("sends less than it stores, because the prompt is paid for per turn", () => {
        expect(MAX_PROMPT_CHARS).toBeLessThan(MAX_STORED_CHARS);
    });

    it("handles no text at all", () => {
        expect(forPrompt("")).toBe("");
        expect(forPrompt(undefined)).toBe("");
    });
});
