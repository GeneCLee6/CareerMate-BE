// Config validation throws on a missing variable, so give the suite the
// minimum it needs. Tests never reach a real database or the Claude API.
process.env.MONGODB_URI ||= "mongodb://127.0.0.1:27017/careermate-test";
process.env.JWT_SECRET ||= "test-secret-not-used-outside-tests";
process.env.S3_BUCKET ||= "test-bucket";
process.env.LOG_LEVEL ||= "error";
