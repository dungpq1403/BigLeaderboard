const rateLimit = require('express-rate-limit');

// Strict limit for login: protects against brute-force password guessing.
// 5 attempts per 15 minutes per IP. Successful logins are NOT counted so a
// legitimate user who logs in correctly isn't punished for repeated sessions.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
});

// Looser limit for registration: prevents mass account creation / spam,
// but doesn't lock out a normal user filling out the form.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many accounts created from this IP. Please try again later.',
  },
});

module.exports = { loginLimiter, registerLimiter };
