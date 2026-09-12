require("dotenv").config({ quiet: true });

const requiredConfigs = {
    MONGODB_URI: process.env.MONGODB_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    S3_BUCKET: process.env.S3_BUCKET,
};

const optionalConfigs = {
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || "dev",
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
    AWS_REGION: process.env.AWS_REGION || "ap-southeast-2",
    CLOUDFRONT_DOMAIN: process.env.CLOUDFRONT_DOMAIN,
    // Optional on purpose: the app boots without it and the chat routes
    // report themselves as unconfigured rather than the server failing.
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    // Email delivery. Without these the app still runs; outside production the
    // message is logged instead of sent, so the flow can be exercised.
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME || "CareerMate AI",
    // Shown in the email footer so a recipient can reply to a human, and used
    // for the link back to the product.
    EMAIL_SUPPORT_ADDRESS: process.env.EMAIL_SUPPORT_ADDRESS,
    APP_URL: process.env.APP_URL || "http://localhost:3000",
    // Comma-separated list of browser origins allowed to call this API.
    // Required in production; the dev server is allowed automatically
    // everywhere else.
    CORS_ORIGINS: process.env.CORS_ORIGINS,
};

for (const key in requiredConfigs) {
    if (!requiredConfigs[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
}

const config = { ...requiredConfigs, ...optionalConfigs };

module.exports = config;
