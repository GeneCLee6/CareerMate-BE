/**
 * Writes every transactional email to ./tmp/email-preview as HTML, so the
 * templates can be looked at without sending anything.
 *
 *     npm run email:preview
 *
 * Open the files in a browser for a quick check. A browser is more forgiving
 * than a real mail client, so this catches "is the wording right, does it look
 * broken" — not "does Outlook render it". For that, send one to yourself.
 */

const fs = require("fs");
const path = require("path");
const {
    verificationEmail,
    passwordResetEmail,
} = require("../src/email/email.template");

const SAMPLE = { name: "Ray", code: "134876", expiryMinutes: 10 };

const OUT_DIR = path.join(__dirname, "..", "tmp", "email-preview");

const previews = [
    ["verification", verificationEmail(SAMPLE)],
    ["password-reset", passwordResetEmail({ ...SAMPLE, code: "998877" })],
    ["verification-no-name", verificationEmail({ ...SAMPLE, name: undefined })],
];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [name, mail] of previews) {
    const htmlPath = path.join(OUT_DIR, `${name}.html`);
    const textPath = path.join(OUT_DIR, `${name}.txt`);
    fs.writeFileSync(htmlPath, mail.html, "utf8");
    // The plain-text part is what a text-only client and most spam filters
    // read, so it is worth looking at too.
    fs.writeFileSync(textPath, `Subject: ${mail.subject}\n\n${mail.text}\n`, "utf8");
    console.log(`${name}\n  ${htmlPath}\n  ${textPath}`);
}

console.log(`\n${previews.length} previews written.`);
