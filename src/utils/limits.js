/**
 * Maximum lengths for user-supplied text, in one place so the API, the
 * database and the frontend cannot drift apart.
 *
 * These are not arbitrary tidiness. Unbounded strings reached three places
 * that all have their own limits:
 *
 * - **Email headers.** A recipient name goes into a header, and Brevo rejects
 *   a request whose headers exceed 4096 characters. A long display name made
 *   registration fail with a 502 *after* the account had been created.
 * - **The AI system prompt.** Profile fields are interpolated into it, so an
 *   unbounded goal is an unbounded prompt: tokens we pay for, and room to
 *   push the real instructions out of the model's attention.
 * - **Storage.** Nothing stopped a single document being megabytes of text.
 */
const LIMITS = {
    /** The longest address RFC 5321 permits. */
    EMAIL: 254,
    FULL_NAME: 100,
    DISPLAY_NAME: 50,
    /** Long enough for a paragraph about what someone wants from their career. */
    GOAL: 500,
    /** Comfortably past what any filesystem allows. */
    FILE_NAME: 255,
};

module.exports = { LIMITS };
