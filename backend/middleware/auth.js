const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      return res.status(401).json({ message: 'Authentication required. Please log in.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Lấy cả role từ database
    const user = await User.findByPk(decoded.id, {
      attributes: ['id', 'username', 'email', 'fullName', 'role'],
    });

    if (!user) {
      return res.status(401).json({ message: 'User not found. Please log in again.' });
    }

    // Gắn user vào req với đầy đủ thông tin, bao gồm role
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token. Please log in again.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired. Please log in again.' });
    }
    return res.status(500).json({ message: 'Authentication error.' });
  }
};

module.exports = authMiddleware;