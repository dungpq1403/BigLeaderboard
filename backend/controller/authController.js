const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

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

      const existingUser = await User.findOne({ where: { username } });
      if (existingUser) {
        return res.status(409).json({ message: 'Username already exists.' });
      }

      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) {
        return res.status(409).json({ message: 'Email already exists.' });
      }

      const hashedPassword = crypto
        .createHash('sha256')
        .update(password)
        .digest('hex');

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
      return res.status(500).json({ message: 'Register failed.', error: error.message });
    }
  },

  // POST /api/login
  async login(req, res) {
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
        return res.status(404).json({
          message: 'Login information does not exist, please register an account.',
        });
      }

      const hashedPassword = crypto
        .createHash('sha256')
        .update(password)
        .digest('hex');

      if (hashedPassword !== user.password) {
        return res.status(401).json({ message: 'Invalid username/email or password.' });
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
      return res.status(500).json({ message: 'Login failed.', error: error.message });
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