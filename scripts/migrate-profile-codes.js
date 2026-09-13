/**
 * Rewrites stored `role` and `field` codes to their current names.
 *
 *     npm run migrate:profile-codes
 *
 * Renaming an enum value is a data migration. The request path already
 * translates old codes on the way in (`normaliseCode`), so nothing breaks
 * without this — but until it runs, the database holds values the current
 * lists do not contain, and anything reading it directly sees `FE`.
 *
 * Safe to re-run: only documents still holding a legacy code are touched, and
 * it reports what it did rather than assuming.
 */

const mongoose = require("mongoose");
const connectDB = require("../src/utils/db");
const User = require("../src/users/user.model");
const { LEGACY_CODES } = require("../src/users/profileOptions");

/** Which fields can hold a legacy code. */
const FIELDS_TO_MIGRATE = ["role", "field"];

async function main() {
    await connectDB();

    const dryRun = process.argv.includes("--dry-run");
    if (dryRun) {
        console.log("Dry run: nothing will be written.\n");
    }

    let changed = 0;

    for (const path of FIELDS_TO_MIGRATE) {
        for (const [from, to] of Object.entries(LEGACY_CODES)) {
            const filter = { [path]: from };
            const count = await User.countDocuments(filter);
            if (count === 0) continue;

            console.log(`${path}: ${from} -> ${to}  (${count} account${count === 1 ? "" : "s"})`);
            changed += count;

            if (!dryRun) {
                // updateMany rather than save(): this is a rename, and running
                // every document through validation would be slower and would
                // fail on unrelated fields that predate a rule.
                await User.updateMany(filter, { $set: { [path]: to } });
            }
        }
    }

    if (changed === 0) {
        console.log("Nothing to migrate — every stored code is current.");
    } else {
        console.log(
            `\n${dryRun ? "Would update" : "Updated"} ${changed} value${changed === 1 ? "" : "s"}.`,
        );
    }

    // Report anything left that the current lists do not recognise, so a value
    // nobody planned for does not sit there silently.
    const { ROLES, FIELDS } = require("../src/users/profileOptions");
    const unknownRoles = await User.distinct("role", {
        role: { $nin: [...ROLES, null] },
    });
    const unknownFields = await User.distinct("field", {
        field: { $nin: [...FIELDS, null] },
    });
    if (unknownRoles.length || unknownFields.length) {
        console.log("\nStill unrecognised:");
        if (unknownRoles.length) console.log("  role:  " + unknownRoles.join(", "));
        if (unknownFields.length) console.log("  field: " + unknownFields.join(", "));
    }

    await mongoose.connection.close();
}

main().catch(async (err) => {
    console.error("Migration failed:", err.message);
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
});
