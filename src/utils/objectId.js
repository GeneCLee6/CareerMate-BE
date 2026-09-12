const mongoose = require("mongoose");

/**
 * True when `value` could be a Mongo document id.
 *
 * Passing anything else to `findById` throws a Mongoose `CastError`, which the
 * error middleware can only treat as a 500 — so a mistyped URL came back as
 * "Something unexpected happened" instead of "not found". Checking first keeps
 * a bad id in the 4xx range where it belongs.
 *
 * `isValid` accepts any 12-byte string as well as a 24-character hex string,
 * so the length check keeps "abcdefghijkl" from being treated as an id.
 */
function isObjectId(value) {
    return (
        typeof value === "string" &&
        value.length === 24 &&
        mongoose.Types.ObjectId.isValid(value)
    );
}

module.exports = { isObjectId };
