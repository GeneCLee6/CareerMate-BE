const crypto = require("crypto");
const { hashPassword, comparePassword } = require("./password");

/** Six digits, matching the design's input. */
const CODE_LENGTH = 6;

/** Codes are short-lived; a stale one is worthless to an attacker. */
const CODE_EXPIRY_MS = 10 * 60 * 1000;

/** Wrong guesses allowed before the code is thrown away entirely. */
const MAX_ATTEMPTS = 5;

/** How long a caller must wait before asking for another code. */
const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * A uniformly random 6-digit code.
 *
 * `crypto.randomInt` rather than `Math.random`: the latter is not a
 * cryptographic source, and `Math.random().toString().slice(2, 8)` — the shape
 * this replaces — can also produce fewer than six characters.
 */
function generateCode() {
    return crypto.randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, "0");
}

/**
 * Codes are stored hashed, never in plain text. Six digits is only a million
 * possibilities, so bcrypt's cost is what makes an offline guess expensive for
 * anyone who reads the database.
 */
function hashCode(code) {
    return hashPassword(code);
}

function compareCode(code, hashedCode) {
    if (!hashedCode) return Promise.resolve(false);
    return comparePassword(code, hashedCode);
}

function expiryFromNow(now = Date.now()) {
    return new Date(now + CODE_EXPIRY_MS);
}

function isExpired(expiry, now = new Date()) {
    return !expiry || expiry < now;
}

/**
 * Milliseconds still to wait before another code may be sent, or 0 if the
 * caller may send now.
 */
function cooldownRemaining(lastSentAt, now = Date.now()) {
    if (!lastSentAt) return 0;
    const elapsed = now - new Date(lastSentAt).getTime();
    return Math.max(0, RESEND_COOLDOWN_MS - elapsed);
}

module.exports = {
    generateCode,
    hashCode,
    compareCode,
    expiryFromNow,
    isExpired,
    cooldownRemaining,
    CODE_LENGTH,
    CODE_EXPIRY_MS,
    MAX_ATTEMPTS,
    RESEND_COOLDOWN_MS,
};
