const mongoose = require("mongoose");
const config = require("../utils/config");
const { ROLES, FIELDS } = require("./profileOptions");

const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        fullName: {
            type: String,
            required: true,
            trim: true,
        },
        displayName: {
            type: String,
            trim: true,
        },
        password: {
            type: String,
            required: true,
        },
        role: {
            type: String,
            enum: ROLES,
        },
        field: {
            type: String,
            enum: FIELDS,
        },
        goal: {
            type: String,
            trim: true,
        },
        avatar: {
            type: String,
        },
        accountType: {
            type: String,
            enum: ["user", "admin"],
            default: "user",
        },
        /** Null until the address is confirmed; login is blocked before that. */
        emailVerifiedAt: {
            type: Date,
            default: null,
        },
        /** bcrypt hash of the 6-digit code, never the code itself. */
        verificationCode: {
            type: String,
        },
        verificationCodeExpiry: {
            type: Date,
        },
        /** Wrong guesses for the current code. */
        verificationAttempts: {
            type: Number,
            default: 0,
        },
        /** Drives the resend cooldown. */
        verificationSentAt: {
            type: Date,
        },
        /** bcrypt hash, same reasoning as verificationCode. */
        resetCode: {
            type: String,
        },
        /** Wrong guesses for the current reset code. */
        resetCodeAttempts: {
            type: Number,
            default: 0,
        },
        resetCodeSentAt: {
            type: Date,
        },
        resetCodeExpiry: {
            type: Date,
        },
        resetToken: {
            type: String,
        },
        resetTokenExpiry: {
            type: Date,
        },
        passwordHistory: {
            type: [String],
            default: [],
        },
        deletedAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (_, user) => {
                delete user.password;
                delete user.__v;
                delete user.accountType;
                delete user.passwordHistory;
                delete user.verificationCode;
                delete user.verificationCodeExpiry;
                delete user.verificationAttempts;
                delete user.verificationSentAt;
                delete user.resetCode;
                delete user.resetCodeExpiry;
                delete user.resetCodeAttempts;
                delete user.resetCodeSentAt;
                delete user.resetToken;
                delete user.resetTokenExpiry;
            },
        },
    },
);

userSchema.virtual("avatarUrl").get(function () {
    if (!this.avatar || !config.CLOUDFRONT_DOMAIN) {
        return null;
    }
    return `https://${config.CLOUDFRONT_DOMAIN}/${this.avatar}`;
});

// email, fullName, displayName, password, role, field, goal, avatar,
const User = mongoose.model("User", userSchema);
module.exports = User;
