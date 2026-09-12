const crypto = require("crypto");
const User = require("../users/user.model");
const UnauthorizedException = require("../exceptions/unauthorized.exception");
const ForbiddenException = require("../exceptions/forbidden.exception");
const ConflictException = require("../exceptions/conflict.exception");
const BadRequestException = require("../exceptions/badRequest.exception");
const { hashPassword, comparePassword } = require("../utils/password");
const { signAccessToken } = require("../utils/jwt");
const logger = require("../utils/logger");
const emailService = require("../email/email.service");
const {
    generateCode,
    hashCode,
    compareCode,
    expiryFromNow,
    isExpired,
    cooldownRemaining,
    MAX_ATTEMPTS,
} = require("../utils/verificationCode");
const { MAX_PASSWORD_HISTORY } = require("../users/constants");

const RESET_ACTION_EXPIRY_TIME = 10 * 60 * 1000;

/** Same wording whether or not the address exists, so it cannot be probed. */
const NEUTRAL_REPLY = "If the email exists, a verification code will be sent";

function issueToken(user) {
    return signAccessToken({ id: user._id, accountType: user.accountType });
}

/** Generates a code, stores its hash on the user, returns the plain code. */
async function attachVerificationCode(user) {
    const code = generateCode();
    user.verificationCode = await hashCode(code);
    user.verificationCodeExpiry = expiryFromNow();
    user.verificationAttempts = 0;
    user.verificationSentAt = new Date();
    return code;
}

function clearVerificationCode(user) {
    user.verificationCode = undefined;
    user.verificationCodeExpiry = undefined;
    user.verificationAttempts = 0;
}

/**
 * Creates the account unverified and emails a code. No token is returned —
 * the caller gets one from /auth/verify-email.
 *
 * Registering again with an address that exists but was never verified simply
 * reissues the code, so an abandoned attempt cannot squat on someone's email.
 */
const register = async (req, res) => {
    const { fullName, email, password } = req.body;

    const existingUser = await User.findOne({ email }).exec();
    if (existingUser && existingUser.emailVerifiedAt) {
        throw new ConflictException("Email already exists!");
    }

    const hashedPassword = await hashPassword(password);
    const user = existingUser ?? new User({ email });

    user.fullName = fullName;
    user.password = hashedPassword;
    user.passwordHistory = [hashedPassword];

    const code = await attachVerificationCode(user);
    await user.save();

    await emailService.sendVerificationCode({
        to: user.email,
        name: user.fullName,
        code,
    });

    res.status(201).json({
        success: true,
        message: "Check your email for a verification code",
        data: { email: user.email },
    });
};

/** Confirms the address and signs the account in. */
const verifyEmail = async (req, res) => {
    const { email, code } = req.body;
    const user = await User.findOne({ email }).exec();

    // Check "already verified" first: verifying clears the code, so the
    // generic branch below would otherwise swallow this case.
    if (user && user.emailVerifiedAt) {
        throw new BadRequestException("This email is already verified");
    }
    if (!user || !user.verificationCode) {
        throw new UnauthorizedException("Invalid or expired verification code");
    }
    if (isExpired(user.verificationCodeExpiry)) {
        throw new UnauthorizedException("Invalid or expired verification code");
    }

    const isMatched = await compareCode(code, user.verificationCode);
    if (!isMatched) {
        user.verificationAttempts += 1;
        // Throw the code away rather than allow unlimited guesses at six digits.
        if (user.verificationAttempts >= MAX_ATTEMPTS) {
            clearVerificationCode(user);
            await user.save();
            throw new UnauthorizedException(
                "Too many incorrect attempts. Request a new code.",
            );
        }
        await user.save();
        throw new UnauthorizedException("Invalid or expired verification code");
    }

    user.emailVerifiedAt = new Date();
    clearVerificationCode(user);
    user.verificationSentAt = undefined;
    await user.save();

    res.json({
        success: true,
        data: { user, accessToken: issueToken(user) },
    });
};

const resendVerification = async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email }).exec();

    if (!user || user.emailVerifiedAt) {
        logger.info("Verification resend requested for an unusable address");
        return res.json({ success: true, message: NEUTRAL_REPLY });
    }

    const waitMs = cooldownRemaining(user.verificationSentAt);
    if (waitMs > 0) {
        throw new BadRequestException(
            `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code`,
        );
    }

    const code = await attachVerificationCode(user);
    await user.save();

    await emailService.sendVerificationCode({
        to: user.email,
        name: user.fullName,
        code,
    });

    res.json({ success: true, message: NEUTRAL_REPLY });
};

const login = async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).exec();
    if (!user) {
        throw new UnauthorizedException("Email and password mismatch");
    }
    const isMatched = await comparePassword(password, user.password);
    if (!isMatched) {
        throw new UnauthorizedException("Invalid username or password");
    }
    if (user.deletedAt) {
        throw new UnauthorizedException("Account has been deleted");
    }
    // 403 rather than 401 so the client can tell "wrong password" from
    // "right password, unverified address" and route to the code screen.
    if (!user.emailVerifiedAt) {
        throw new ForbiddenException("Please verify your email before logging in");
    }

    res.json({ success: true, data: { user, accessToken: issueToken(user) } });
};

const forgotPassword = async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email }).exec();
    if (!user) {
        logger.info("Password reset requested for an unknown address");
        return res.json({ success: true, message: NEUTRAL_REPLY });
    }

    const waitMs = cooldownRemaining(user.resetCodeSentAt);
    if (waitMs > 0) {
        throw new BadRequestException(
            `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code`,
        );
    }

    const code = generateCode();
    user.resetCode = await hashCode(code);
    user.resetCodeExpiry = new Date(Date.now() + RESET_ACTION_EXPIRY_TIME);
    user.resetCodeAttempts = 0;
    user.resetCodeSentAt = new Date();
    await user.save();

    await emailService.sendPasswordResetCode({
        to: user.email,
        name: user.fullName,
        code,
    });

    res.json({ success: true, message: "verification code has been sent" });
};

const verifyCode = async (req, res) => {
    const { email, code } = req.body;
    const user = await User.findOne({ email }).exec();

    if (!user || !user.resetCode || isExpired(user.resetCodeExpiry)) {
        throw new UnauthorizedException("Invalid or expired verification code");
    }

    const isMatched = await compareCode(code, user.resetCode);
    if (!isMatched) {
        user.resetCodeAttempts += 1;
        if (user.resetCodeAttempts >= MAX_ATTEMPTS) {
            user.resetCode = undefined;
            user.resetCodeExpiry = undefined;
            user.resetCodeAttempts = 0;
            await user.save();
            throw new UnauthorizedException(
                "Too many incorrect attempts. Request a new code.",
            );
        }
        await user.save();
        throw new UnauthorizedException("Invalid or expired verification code");
    }

    user.resetCode = undefined;
    user.resetCodeExpiry = undefined;
    user.resetCodeAttempts = 0;

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetToken = resetToken;
    user.resetTokenExpiry = new Date(Date.now() + RESET_ACTION_EXPIRY_TIME);

    await user.save();

    res.json({ success: true, data: { resetToken } });
};

const resetPassword = async (req, res) => {
    const { email, resetToken, newPassword } = req.body;
    const user = await User.findOne({ email }).exec();
    if (
        !user ||
        user.resetToken !== resetToken ||
        user.resetTokenExpiry < new Date()
    ) {
        throw new UnauthorizedException("Invalid or expired reset token");
    }

    for (const oldPassword of user.passwordHistory) {
        const isSame = await comparePassword(newPassword, oldPassword);
        if (isSame) {
            throw new BadRequestException(
                "New password cannot be the same as any of the previous passwords",
            );
        }
    }
    const hashedPassword = await hashPassword(newPassword);
    user.password = hashedPassword;
    let passwordHistory = [...user.passwordHistory, hashedPassword];
    if (passwordHistory.length > MAX_PASSWORD_HISTORY) {
        passwordHistory = passwordHistory.slice(-MAX_PASSWORD_HISTORY);
    }
    user.passwordHistory = passwordHistory;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();
    res.json({ success: true, message: "Password reset successfully" });
};

const authController = {
    register,
    verifyEmail,
    resendVerification,
    login,
    forgotPassword,
    verifyCode,
    resetPassword,
};

module.exports = authController;
