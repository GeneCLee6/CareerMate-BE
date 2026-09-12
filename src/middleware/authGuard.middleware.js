const UnauthorizedException = require("../exceptions/unauthorized.exception");
const { verifyAccessToken } = require("../utils/jwt");
const User = require("../users/user.model");

/**
 * Verifies the bearer token and confirms the account is still usable.
 *
 * The signature check alone is not enough: a JWT stays valid until it
 * expires, so a deleted account kept working for up to seven days after
 * deletion. This costs one indexed lookup by `_id` per request, which is the
 * usual price of being able to revoke a stateless token at all.
 */
const authGuard = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new UnauthorizedException("Authentication required");
    }

    const token = authHeader.split(" ")[1];

    let payload;
    try {
        payload = verifyAccessToken(token);
    } catch (e) {
        throw new UnauthorizedException("Invalid or expired token", { err: e });
    }

    const account = await User.findById(payload.id)
        .select("deletedAt accountType")
        .lean();

    if (!account || account.deletedAt) {
        // The same message as a bad token: whether the account was deleted or
        // never existed is not the caller's business.
        throw new UnauthorizedException("Invalid or expired token");
    }

    req.user = {
        ...payload,
        // Trust the stored role over the one minted into the token, so a
        // change of role takes effect immediately rather than at next sign-in.
        accountType: account.accountType,
    };
    next();
};

module.exports = authGuard;
