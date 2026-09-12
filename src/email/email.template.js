const config = require("../utils/config");

/**
 * HTML for the transactional emails.
 *
 * Email clients are not browsers. What is safe here is a narrow subset of what
 * a page can do, so this file deliberately looks dated:
 *
 * - Layout is nested tables, not flexbox or grid. Outlook renders through Word,
 *   which has no support for either.
 * - Every style is inline. Gmail strips <style> blocks in some contexts, and
 *   there is no reliable external CSS.
 * - No images. Most clients block remote images until the reader allows them,
 *   so a logo drawn as an image is a blank box on first open — exactly the
 *   moment this email has to look legitimate. The wordmark is live text.
 * - The gradient is a background-image over a solid `bgcolor`. Clients that
 *   understand it show the gradient; the rest show the brand purple.
 *
 * Structure is shared so every message reads as the same product; only the
 * heading, the lead line and the action block change.
 */

const FONT = "Helvetica,Arial,'Segoe UI',sans-serif";

const BRAND = {
    /** Matches the product's `gradient` token. */
    gradientCss: "linear-gradient(110deg, #504ffd 11%, #40c3fb 92%)",
    /** The solid fallback for clients that drop the gradient. */
    solid: "#504ffd",
    text: "#161616",
    muted: "#595959",
    faint: "#8a8a8a",
    border: "#e8e8ee",
    page: "#f4f5f9",
};

const escapeHtml = (value) =>
    String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

/**
 * The line clients show next to the subject in the inbox list. Without one
 * they scrape the first text in the body, which here would be the wordmark.
 */
const preheader = (text) => `
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
        ${escapeHtml(text)}
      </div>`;

const header = () => `
          <tr>
            <td bgcolor="${BRAND.solid}" style="background-color:${BRAND.solid};background-image:${BRAND.gradientCss};padding:28px 32px;border-radius:16px 16px 0 0;">
              <p style="margin:0;font-family:${FONT};font-size:19px;font-weight:700;letter-spacing:-0.2px;color:#ffffff;">
                CareerMate<span style="opacity:0.75;"> AI</span>
              </p>
              <p style="margin:4px 0 0;font-family:${FONT};font-size:12px;color:rgba(255,255,255,0.82);">
                Resume feedback, interview practice, career planning
              </p>
            </td>
          </tr>`;

/**
 * The sign-off. A transactional email that ends abruptly reads like a phishing
 * attempt, so it names the sender, says why the mail arrived, and — when a
 * support address is configured — offers a human to reply to.
 */
const signature = () => {
    const support = config.EMAIL_SUPPORT_ADDRESS;
    const supportLine = support
        ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.faint};">
                 Questions? Reply to this email or write to
                 <a href="mailto:${escapeHtml(support)}" style="color:${BRAND.faint};">${escapeHtml(support)}</a>.
               </p>`
        : "";

    return `
          <tr>
            <td style="padding:0 32px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid ${BRAND.border};padding-top:20px;">
                    <p style="margin:0 0 4px;font-family:${FONT};font-size:13px;font-weight:600;color:${BRAND.text};">
                      The CareerMate AI team
                    </p>
                    <p style="margin:0 0 14px;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.muted};">
                      <a href="${escapeHtml(config.APP_URL)}" style="color:${BRAND.solid};text-decoration:none;">${escapeHtml(config.APP_URL.replace(/^https?:\/\//, ""))}</a>
                    </p>
                    ${supportLine}
                    <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.faint};">
                      You received this email because someone used this address
                      to sign in to CareerMate AI. This message was sent
                      automatically — no one is tracking whether you open it.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
};

/**
 * The six digits, spaced so they can be read aloud or copied in one go.
 * Rendered as text rather than an image so it survives image blocking and can
 * be selected on a phone.
 */
const codeBlock = (code) => `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
                <tr>
                  <td align="center" bgcolor="#f6f6fb" style="background-color:#f6f6fb;border:1px solid ${BRAND.border};border-radius:12px;padding:22px 16px;">
                    <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;text-transform:uppercase;letter-spacing:1.4px;color:${BRAND.faint};">
                      Your code
                    </p>
                    <p style="margin:0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:9px;color:${BRAND.text};">
                      ${escapeHtml(code)}
                    </p>
                  </td>
                </tr>
              </table>`;

/** Wraps content in the outer shell every message shares. */
function layout({ preheaderText, heading, bodyHtml }) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${BRAND.page};">
    ${preheader(preheaderText)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.page};padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;border:1px solid ${BRAND.border};">
            ${header()}
            <tr>
              <td style="padding:32px 32px 8px;">
                <h1 style="margin:0 0 12px;font-family:${FONT};font-size:22px;font-weight:700;line-height:1.3;color:${BRAND.text};">
                  ${escapeHtml(heading)}
                </h1>
                <div style="font-family:${FONT};">
                  ${bodyHtml}
                </div>
              </td>
            </tr>
            ${signature()}
          </table>
          <p style="max-width:600px;margin:16px auto 0;font-family:${FONT};font-size:11px;line-height:1.6;color:${BRAND.faint};text-align:center;">
            © ${new Date().getFullYear()} CareerMate AI
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Shared wording for the two code emails, so they stay consistent. */
function codeBody({ lead, code, expiryMinutes, ignoreLine }) {
    return `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${BRAND.muted};">
                    ${lead}
                  </p>
                  ${codeBlock(code)}
                  <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${BRAND.muted};">
                    The code expires in ${expiryMinutes} minutes and can be used once.
                  </p>
                  <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:${BRAND.muted};">
                    ${ignoreLine}
                  </p>`;
}

function verificationEmail({ name, code, expiryMinutes }) {
    const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";
    return {
        subject: "Verify your CareerMate AI account",
        html: layout({
            preheaderText: `${code} is your CareerMate AI verification code.`,
            heading: "Confirm your email address",
            bodyHtml: codeBody({
                lead: `${greeting} enter this code to finish setting up your account. Until it is confirmed, the account cannot be used to sign in.`,
                code,
                expiryMinutes,
                ignoreLine:
                    "If you did not create a CareerMate AI account, you can ignore this email — nothing was created without this code.",
            }),
        }),
        text: [
            `${name ? `Hi ${name},` : "Hi,"}`,
            "",
            "Enter this code to finish setting up your CareerMate AI account:",
            "",
            `    ${code}`,
            "",
            `The code expires in ${expiryMinutes} minutes and can be used once.`,
            "If you did not create an account, you can ignore this email.",
            "",
            "— The CareerMate AI team",
            config.APP_URL,
        ].join("\n"),
    };
}

function passwordResetEmail({ name, code, expiryMinutes }) {
    const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";
    return {
        subject: "Reset your CareerMate AI password",
        html: layout({
            preheaderText: `${code} is your CareerMate AI password reset code.`,
            heading: "Reset your password",
            bodyHtml: codeBody({
                lead: `${greeting} enter this code to choose a new password. Your current password stays active until you do.`,
                code,
                expiryMinutes,
                ignoreLine:
                    "If you did not ask to reset your password, ignore this email and consider changing your password — someone knows your email address.",
            }),
        }),
        text: [
            `${name ? `Hi ${name},` : "Hi,"}`,
            "",
            "Enter this code to choose a new CareerMate AI password:",
            "",
            `    ${code}`,
            "",
            `The code expires in ${expiryMinutes} minutes and can be used once.`,
            "If you did not ask for this, ignore this email.",
            "",
            "— The CareerMate AI team",
            config.APP_URL,
        ].join("\n"),
    };
}

module.exports = {
    verificationEmail,
    passwordResetEmail,
    escapeHtml,
};
