/**
 * Rate Limiter Middleware
 * Prevents brute-force attacks on login and API abuse
 */
const rateLimit = require('express-rate-limit');

/** Login rate limiter: 10 attempts per 15 minutes */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        message: 'Too many login attempts. Please try again after 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.body.username || req.ip
});

/** General API rate limiter: 2000 requests per 15 minutes per IP */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    message: {
        success: false,
        message: 'Too many requests. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for authenticated users (they have a token)
    skip: (req) => {
        const auth = req.headers.authorization;
        return auth && auth.startsWith('Bearer ');
    }
});

module.exports = { loginLimiter, apiLimiter };
