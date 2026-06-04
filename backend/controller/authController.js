const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../config/jwt');

const BCRYPT_ROUNDS = 12;
const IS_PROD = process.env.NODE_ENV === 'production';

// Detects legacy SHA-256 hashes (64-char hex) from before the bcrypt migration.
// Bcrypt hashes always start with $2a$, $2b$, or $2y$.
const LEGACY_SHA256_RE = /^[a-f0-9]{64}$/i;

function legacyVerify(plain, stored) {
  const hashed = crypto.createHash('sha256').update(plain).digest('hex');
  // timingSafeEqual avoids leaking info via response-time differences
  return (
    hashed.length === stored.length &&
    crypto.timingSafeEqual(Buffer.from(hashed), Buffer.from(stored))
  );
}

// Wraps error responses so we never leak DB / stack info to the client in prod.
function errorBody(publicMessage, error) {
  if (IS_PROD) return { message: publicMessage };
  return { message: publicMessage, error: error?.message };
}

const authController = {
  // POST /api/register
  async register(req, res) {
    try {
      const { username, email, password, fullName, birthDate, description, country } = req.body;

      if (!username || !email || !password || !fullName || !birthDate) {
        return res.status(400).json({
          message: 'Username, email, password, fullName and birthDate are required.',
        });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email format.' });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters.' });
      }

      const existingUser = await User.findOne({ where: { username } });
      if (existingUser) {
        return res.status(409).json({ message: 'Username already exists.' });
      }

      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) {
        return res.status(409).json({ message: 'Email already exists.' });
      }

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const newUser = await User.create({
        username,
        email,
        password: hashedPassword,
        fullName,
        birthDate,
        description: description || '',
        country: country || '',
        role: 'user',
      });

      return res.status(201).json({
        message: 'Register successful.',
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          fullName: newUser.fullName,
          country: newUser.country,
          role: newUser.role,
        },
      });
    } catch (error) {
      console.error('[register] error:', error);
      return res.status(500).json(errorBody('Register failed.', error));
    }
  },

  // POST /api/login
  async login(req, res) {
    // Generic credential-failure response. Reused for "user not found" and
    // "wrong password" so an attacker can't enumerate which usernames/emails
    // are registered.
    const invalidCredentials = () =>
      res.status(401).json({ message: 'Tài khoản hoặc mật khẩu không đúng.' });

    try {
      const { username, email, password } = req.body;

      if ((!username && !email) || !password) {
        return res.status(400).json({ message: 'Username/Email and password are required.' });
      }

      let user;
      if (username) {
        user = await User.findOne({ where: { username } });
      } else if (email) {
        user = await User.findOne({ where: { email } });
      }

      if (!user) {
        // Spend roughly the same time as a real bcrypt compare to reduce the
        // timing side-channel between "no such user" and "wrong password".
        await bcrypt.compare(password, '$2b$12$CwTycUXWue0Thq9StjUM0uJ8.QmZQz4zV1jzKQy8nQ8mYbqgC1L9q');
        return invalidCredentials();
      }

      let isValid = false;
      let needsRehash = false;

      if (user.password.startsWith('$2')) {
        isValid = await bcrypt.compare(password, user.password);
      } else if (LEGACY_SHA256_RE.test(user.password)) {
        // Migration path: accept old SHA-256 hashes one more time,
        // then upgrade the user to bcrypt transparently on success.
        isValid = legacyVerify(password, user.password);
        needsRehash = isValid;
      }

      if (!isValid) {
        return invalidCredentials();
      }

      if (needsRehash) {
        try {
          user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
          await user.save();
        } catch (e) {
          // Don't block login if rehash fails; just log so we can investigate.
          console.error('[login] failed to rehash legacy password:', e);
        }
      }

      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        message: 'Login successful.',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('[login] error:', error);
      return res.status(500).json(errorBody('Login failed.', error));
    }
  },

  // GET /api/verify-token
  async verifyToken(req, res) {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

      if (!token) {
        return res.status(401).json({ message: 'Token is missing.' });
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findByPk(decoded.id, {
        attributes: ['id', 'username', 'email', 'fullName', 'role'],
      });

      if (!user) {
        return res.status(401).json({ message: 'Invalid token user.' });
      }

      return res.status(200).json({
        message: 'Token is valid.',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
      });
    } catch (error) {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }
  },
};

module.exports = authController;
