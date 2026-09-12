/**
 * Creates (or resets) a verified account for local testing.
 *
 *     npm run seed:dev-user
 *
 * Why a script and not a documented email and password: this repository is
 * public. A working credential written into the README is a working
 * credential for anyone who reads it, and git history keeps it even after the
 * line is deleted. The script generates a password instead and prints it
 * once, to the terminal of whoever ran it.
 *
 * The account is created already verified, so testing does not need a round
 * trip through email. That is the one thing the normal registration flow will
 * not do for you, and the only reason this script exists.
 *
 * Re-running is safe: an existing account is reset rather than duplicated.
 */

const crypto = require("crypto");
const mongoose = require("mongoose");
const config = require("../src/utils/config");
const connectDB = require("../src/utils/db");
const User = require("../src/users/user.model");
const { hashPassword } = require("../src/utils/password");

const DEFAULT_EMAIL = "dev@careermate.local";

/**
 * A password that satisfies the project's own rule — at least 8 characters
 * with a letter and a digit — without depending on luck for either.
 */
function generatePassword() {
    const body = crypto.randomBytes(9).toString("base64url").replace(/[^A-Za-z0-9]/g, "");
    const digit = crypto.randomInt(0, 10);
    return `Dev${body}${digit}`;
}

async function main() {
    if (config.NODE_ENV === "production") {
        // A seeded account with a known shape has no business in production.
        console.error("Refusing to seed: NODE_ENV is production.");
        process.exit(1);
    }

    const email = (process.env.SEED_USER_EMAIL || DEFAULT_EMAIL).toLowerCase();
    const password = process.env.SEED_USER_PASSWORD || generatePassword();
    const generated = !process.env.SEED_USER_PASSWORD;

    await connectDB();
    console.log(`database: ${mongoose.connection.name}`);

    const fields = {
        fullName: "Dev Tester",
        displayName: "Dev",
        password: await hashPassword(password),
        role: "Student",
        field: "FE",
        goal: "Land a junior frontend role",
        // Verified outright: the point of the script is to skip the email.
        emailVerifiedAt: new Date(),
        // Leave nothing half-finished behind from an earlier run.
        verificationCode: undefined,
        verificationCodeExpiry: undefined,
        verificationAttempts: 0,
        resetCode: undefined,
        resetCodeExpiry: undefined,
        resetCodeAttempts: 0,
        passwordHistory: [],
        deletedAt: null,
    };

    const existing = await User.findOne({ email });
    if (existing) {
        await User.updateOne({ email }, { $set: fields, $unset: { deletedAt: "" } });
        console.log(`reset existing account: ${email}`);
    } else {
        await User.create({ email, ...fields });
        console.log(`created account: ${email}`);
    }

    console.log("\n  email:    " + email);
    console.log("  password: " + password);
    if (generated) {
        console.log(
            "\n  Generated for this run. Set SEED_USER_PASSWORD in .env to pin it.",
        );
    }
    console.log("  Local testing only. Never reuse this password anywhere.\n");

    await mongoose.connection.close();
}

main().catch(async (err) => {
    console.error("Seeding failed:", err.message);
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
});
