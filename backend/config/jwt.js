const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.trim() === '' || JWT_SECRET === 'dev_secret_change_me') {
  // Fail fast at startup: a weak or missing JWT secret lets anyone forge tokens
  // for any user, including admins. Refuse to boot until it's set properly.
  throw new Error(
    'FATAL: JWT_SECRET environment variable is missing or insecure. ' +
      'Set a strong random value (e.g. `openssl rand -hex 64`) in your .env file.'
  );
}

if (process.env.NODE_ENV === 'production' && JWT_SECRET.length < 32) {
  throw new Error(
    'FATAL: JWT_SECRET is too short for production (minimum 32 characters recommended).'
  );
}

module.exports = { JWT_SECRET };
