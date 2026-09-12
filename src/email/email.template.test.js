jest.mock("../utils/config", () => ({
    ...jest.requireActual("../utils/config"),
    APP_URL: "https://careermate.example",
    EMAIL_SUPPORT_ADDRESS: "help@careermate.example",
}));

const {
    verificationEmail,
    passwordResetEmail,
    escapeHtml,
} = require("./email.template");

const ARGS = { name: "Ray", code: "134876", expiryMinutes: 10 };

describe("verificationEmail", () => {
    const mail = verificationEmail(ARGS);

    it("says what it is in the subject", () => {
        expect(mail.subject).toMatch(/verify/i);
    });

    it("carries the code in the HTML, the text part and the preheader", () => {
        expect(mail.html).toContain("134876");
        expect(mail.text).toContain("134876");
        // The preheader is what the inbox list shows next to the subject; a
        // code visible there saves opening the mail at all.
        const preheader = mail.html.slice(0, mail.html.indexOf("<table"));
        expect(preheader).toContain("134876");
    });

    it("greets the recipient by name", () => {
        expect(mail.html).toContain("Hi Ray,");
        expect(mail.text).toContain("Hi Ray,");
    });

    it("still reads correctly with no name", () => {
        const anonymous = verificationEmail({ ...ARGS, name: undefined });
        expect(anonymous.html).toContain("Hi,");
        expect(anonymous.html).not.toContain("undefined");
    });

    it("quotes the expiry it was given rather than a hard-coded one", () => {
        const shortLived = verificationEmail({ ...ARGS, expiryMinutes: 3 });
        expect(shortLived.html).toContain("expires in 3 minutes");
        expect(shortLived.text).toContain("expires in 3 minutes");
    });

    it("tells a recipient who did not ask for it what to do", () => {
        expect(mail.html).toMatch(/did not create/i);
    });

    it("signs off and links back to the product", () => {
        expect(mail.html).toContain("The CareerMate AI team");
        expect(mail.html).toContain("https://careermate.example");
        expect(mail.html).toContain("help@careermate.example");
    });

    it("keeps the layout in tables and the styles inline", () => {
        // Not stylistic: Outlook renders through Word, and Gmail can drop a
        // <style> block, so neither flexbox nor a stylesheet can be relied on.
        expect(mail.html).toContain("<table");
        expect(mail.html).not.toMatch(/<style[\s>]/);
        expect(mail.html).not.toMatch(/display:\s*flex/);
    });

    it("uses no remote images, which clients block by default", () => {
        expect(mail.html).not.toContain("<img");
    });

    it("gives the gradient a solid fallback", () => {
        // Outlook drops background-image; without bgcolor the header turns
        // into white text on white.
        expect(mail.html).toContain('bgcolor="#504ffd"');
    });
});

describe("passwordResetEmail", () => {
    const mail = passwordResetEmail({ ...ARGS, code: "998877" });

    it("is about resetting, not verifying", () => {
        expect(mail.subject).toMatch(/reset/i);
        expect(mail.subject).not.toMatch(/verify/i);
    });

    it("reassures the reader their current password still works", () => {
        expect(mail.html).toMatch(/current password stays active/i);
    });

    it("warns the reader if they did not ask for it", () => {
        expect(mail.html).toMatch(/did not ask/i);
    });
});

describe("escapeHtml", () => {
    it("stops a name from closing a tag", () => {
        const mail = verificationEmail({
            ...ARGS,
            name: '<script>alert("x")</script>',
        });
        expect(mail.html).not.toContain("<script>");
        expect(mail.html).toContain("&lt;script&gt;");
    });

    it("escapes the characters that matter", () => {
        expect(escapeHtml(`<&">'`)).toBe("&lt;&amp;&quot;&gt;&#39;");
    });
});
