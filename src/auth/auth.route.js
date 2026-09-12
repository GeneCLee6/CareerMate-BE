const express = require("express");
const authController = require("./auth.controller");
const { validateBody } = require("../middleware/validation.middleware");
const {
    registerSchema,
    loginSchema,
    forgotPasswordSchema,
    verifyCodeSchema,
    verifyEmailSchema,
    resendVerificationSchema,
    resetPasswordSchema,
} = require("./auth.validation");
const authGuard = require("../middleware/authGuard.middleware");
const roleGuard = require("../middleware/roleGuard.middleware");

const authRouter = express.Router();

authRouter.post(
    "/register",
    validateBody(registerSchema),
    authController.register,
);
authRouter.post(
    "/verify-email",
    validateBody(verifyEmailSchema),
    authController.verifyEmail,
);
authRouter.post(
    "/resend-verification",
    validateBody(resendVerificationSchema),
    authController.resendVerification,
);
authRouter.post("/login", validateBody(loginSchema), authController.login);
authRouter.post(
    "/forgot-password",
    validateBody(forgotPasswordSchema),
    authController.forgotPassword,
);
authRouter.post(
    "/verify-code",
    validateBody(verifyCodeSchema),
    authController.verifyCode,
);
authRouter.post(
    "/reset-password",
    validateBody(resetPasswordSchema),
    authController.resetPassword,
);

authRouter.get("/admin", authGuard, roleGuard("admin"), (req, res) => {
    res.json("admin only");
});
authRouter.get(
    "/admin-or-user",
    authGuard,
    roleGuard("admin", "user"),
    (req, res) => {
        res.json("admin or user access granted");
    },
);

module.exports = authRouter;
