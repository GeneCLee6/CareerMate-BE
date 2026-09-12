const config = require("../utils/config");
const logger = require("../utils/logger");
const AppException = require("../exceptions/app.exception");
const { CODE_EXPIRY_MS } = require("../utils/verificationCode");
const {
    verificationEmail,
    passwordResetEmail,
} = require("./email.template");

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/** Quoted in the body, so it is read from the same place the code honours. */
const EXPIRY_MINUTES = Math.round(CODE_EXPIRY_MS / 60000);

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

function sendVerificationCode({ to, name, code }) {
    const { subject, html, text } = verificationEmail({
        name,
        code,
        expiryMinutes: EXPIRY_MINUTES,
    });
    return send({ to, toName: name, subject, html, text });
}

function sendPasswordResetCode({ to, name, code }) {
    const { subject, html, text } = passwordResetEmail({
        name,
        code,
        expiryMinutes: EXPIRY_MINUTES,
    });
    return send({ to, toName: name, subject, html, text });
}

module.exports = {
    isConfigured,
    send,
    sendVerificationCode,
    sendPasswordResetCode,
};
