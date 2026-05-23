const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Controllers
const authController = require('../controller/authController');
const userController = require('../controller/userController');
const gameController = require('../controller/gameController');
const tournamentController = require('../controller/tournamentController');
const registrationController = require('../controller/registrationController');
const uploadController = require('../controller/uploadController');

// Cấu hình multer cho tournament image
const tournamentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../frontend/public/uploads/tournaments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'tournament-' + uniqueSuffix + ext);
  }
});

const uploadTournament = multer({ 
  storage: tournamentStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// ============ AUTH ROUTES ============
router.get('/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/verify-token', authController.verifyToken);

// ============ USER ROUTES ============
router.get('/users', (req, res) => {
  res.json([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
});

router.get('/users/:id', userController.getUser);
router.put('/users/:id', authMiddleware, userController.updateUser);
router.delete('/users/:id', authMiddleware, userController.deleteUser);
router.get('/users/:userId/registered-tournaments', userController.getRegisteredTournaments);
router.get('/users/:userId/hosted-tournaments', userController.getHostedTournaments);
router.get('/users/email/:email', userController.getUserByEmail);

// ============ GAME ROUTES ============
router.get('/games', gameController.getAllGames);
router.get('/games/:id', gameController.getGameById);
router.post('/games', authMiddleware, adminMiddleware, gameController.createGame);
router.put('/games/:id', authMiddleware, adminMiddleware, gameController.updateGame);
router.delete('/games/:id', authMiddleware, adminMiddleware, gameController.deleteGame);

// ============ TOURNAMENT ROUTES ============
router.get('/tournaments/search', tournamentController.searchTournaments);
router.get('/tournaments/:id', tournamentController.getTournamentById);
router.post('/tournaments', authMiddleware, tournamentController.createTournament);
router.delete('/tournaments/:id', authMiddleware, tournamentController.deleteTournament);
router.get('/tournaments/:id/contacts', tournamentController.getTournamentContacts);
router.get('/tournaments/:id/participants', authMiddleware, tournamentController.getParticipants);
router.get('/games/:gameId/tournaments', tournamentController.getTournamentsByGame);
// Thêm vào routes/api.js
router.put('/tournaments/:id', authMiddleware, tournamentController.updateTournament);

// ============ REGISTRATION ROUTES ============
router.post('/tournaments/:id/register', authMiddleware, registrationController.registerTournament);
router.delete('/tournaments/:id/cancel-registration', authMiddleware, registrationController.cancelRegistration);
router.get('/tournaments/:id/check-registration', async (req, res, next) => {
  // Kiểm tra token nếu có nhưng không bắt buộc
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
      const decoded = jwt.verify(token, JWT_SECRET);
      const User = require('../models/User');
      const user = await User.findByPk(decoded.id, {
        attributes: ['id', 'username', 'email', 'fullName', 'role'],
      });
      if (user) {
        req.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        };
      }
    } catch (e) {
      // Token invalid, tiếp tục với req.user = undefined
    }
  }
  next();
}, registrationController.checkRegistrationStatus);
router.get('/tournaments/:id/registration-status', authMiddleware, registrationController.getRegistrationStatus);

// ============ UPLOAD ROUTES ============
router.post('/upload/tournament-image', authMiddleware, uploadTournament.single('image'), uploadController.uploadTournamentImage);

module.exports = router;