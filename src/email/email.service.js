const config = require("../utils/config");
const logger = require("../utils/logger");
const AppException = require("../exceptions/app.exception");

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/** True when the server can actually send mail. */
function isConfigured() {
    return Boolean(config.BREVO_API_KEY && config.EMAIL_FROM_ADDRESS);
}

/**
 * Posts one transactional email to Brevo.
 *
 * Uses their HTTP API directly rather than the SDK: it is a single endpoint
 * with a stable shape, and one less dependency to keep current.
 */
async function send({ to, toName, subject, html, text }) {
    if (!isConfigured()) {
        // Outside production, log what would have been sent so the whole flow
        // can be exercised before any provider is set up. Guarded because the
        // body of a verification email contains the code itself.
        if (config.NODE_ENV !== "production") {
            logger.warn(
                "Email not configured — logging instead of sending. " +
                    "Set BREVO_API_KEY and EMAIL_FROM_ADDRESS to send for real.",
                { to, subject, text },
            );
            return { delivered: false, loggedOnly: true };
        }
        throw new AppException(503, "Email delivery is not configured.");
    }

    let response;
    try {
        response = await fetch(BREVO_ENDPOINT, {
            method: "POST",
            headers: {
                "api-key": config.BREVO_API_KEY,
                "Content-Type": "application/json",
                accept: "application/json",
            },
            body: JSON.stringify({
                sender: {
                    email: config.EMAIL_FROM_ADDRESS,
                    name: config.EMAIL_FROM_NAME,
                },
                to: [{ email: to, ...(toName ? { name: toName } : {}) }],
                subject,
                htmlContent: html,
                textContent: text,
            }),
        });
    } catch (err) {
        logger.error("Could not reach the email provider", {
            message: err.message,
        });
        throw new AppException(502, "Could not send the email. Please try again.");
    }

    if (!response.ok) {
        // Brevo explains refusals in the body; keep it in the log, not the
        // response, since it can name the account and sender identity.
        const detail = await response.text().catch(() => "");
        logger.error("Email provider rejected the message", {
            status: response.status,
            detail: detail.slice(0, 500),
        });
        throw new AppException(502, "Could not send the email. Please try again.");
    }

    return { delivered: true, loggedOnly: false };
}

/** Shared shell so every message looks like it came from the same product. */
function layout(heading, bodyHtml) {
    return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f9fafc;font-family:Helvetica,Arial,sans-serif;color:#161616;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;">${heading}</h1>
      ${bodyHtml}
      <p style="margin:32px 0 0;font-size:12px;color:#898989;">
        If you didn't request this, you can ignore this email.
      </p>
    </div>
  </body>
</html>`;
}

function codeBlock(code) {
    return `<p style="margin:0 0 8px;font-size:15px;">Your code is:</p>
      <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:6px;">${code}</p>
      <p style="margin:16px 0 0;font-size:14px;color:#595959;">
        It expires in 10 minutes.
      </p>`;
}

function sendVerificationCode({ to, name, code }) {
    return send({
        to,
        toName: name,
        subject: "Verify your CareerMate AI account",
        html: layout(
            "Welcome to CareerMate AI",
            `<p style="margin:0 0 24px;font-size:15px;">
               Enter this code to finish creating your account.
             </p>${codeBlock(code)}`,
        ),
        text: `Welcome to CareerMate AI.\n\nYour verification code is ${code}.\nIt expires in 10 minutes.`,
    });
}

function sendPasswordResetCode({ to, name, code }) {
    return send({
        to,
        toName: name,
        subject: "Reset your CareerMate AI password",
        html: layout(
            "Reset your password",
            `<p style="margin:0 0 24px;font-size:15px;">
               Enter this code to choose a new password.
             </p>${codeBlock(code)}`,
        ),
        text: `Reset your CareerMate AI password.\n\nYour reset code is ${code}.\nIt expires in 10 minutes.`,
    });
}

module.exports = {
    isConfigured,
    send,
    sendVerificationCode,
    sendPasswordResetCode,
};
