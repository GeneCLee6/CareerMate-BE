const AppException = require("./app.exception");

class TooManyRequestsException extends AppException {
    constructor(message = "Too many requests", context = {}) {
        super(429, message, context);
    }
}

module.exports = TooManyRequestsException;
