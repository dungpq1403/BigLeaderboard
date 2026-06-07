const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');
const { attachIdParamDecoders } = require('../middleware/idHash');
const { JWT_SECRET } = require('../config/jwt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Controllers
const authController = require('../controller/authController');
const userController = require('../controller/userController');
const gameController = require('../controller/gameController');
const tournamentController = require('../controller/tournamentController');
const registrationController = require('../controller/registrationController');
const Tournament = require('../models/Tournament');
const TournamentRoundBestOf = require('../models/TournamentRoundBestOf');
const GroupMatch = require('../models/GroupMatch');
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

// Đăng ký auto-decode hash → số nguyên cho mọi URL param tên trong DECODE_PARAMS
// (id, tournamentId, gameId, userId). Phải gọi TRƯỚC khi định nghĩa các route
// để Express xử lý đúng.
attachIdParamDecoders(router);

// ============ AUTH ROUTES ============
router.get('/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

router.post('/register', registerLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
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
router.get('/tournaments/:id/group-matches', tournamentController.getGroupMatches);
router.get('/tournaments/:id/bracket-data', tournamentController.getBracketData);
router.put('/tournaments/:id/group-matches/:matchId', tournamentController.updateGroupMatches);
router.post('/tournaments/:id/initialize-group-matches', tournamentController.createGroupMatches);
router.post('/tournaments/:id/group-matches/schedule', authMiddleware, tournamentController.scheduleGroupMatches);
router.post('/tournaments/:id/group-matches/ensure', authMiddleware, tournamentController.ensureGroupMatches);
// Single elimination match scores (lưu DB thay cho localStorage)
router.get('/tournaments/:id/single-elim-matches', tournamentController.getSingleEliminationMatches);
router.put('/tournaments/:id/single-elim-matches/:matchId', authMiddleware, tournamentController.upsertSingleEliminationMatch);
router.delete('/tournaments/:id/single-elim-matches/:matchId', authMiddleware, tournamentController.deleteSingleEliminationMatch);
// Double elimination match scores (lưu DB thay cho localStorage). API mirror
// với single-elim-matches; FE truyền thêm "bracket" (WB|LB|GF) để DB lưu kèm.
router.get('/tournaments/:id/double-elim-matches', tournamentController.getDoubleEliminationMatches);
router.put('/tournaments/:id/double-elim-matches/:matchId', authMiddleware, tournamentController.upsertDoubleEliminationMatch);
router.delete('/tournaments/:id/double-elim-matches/:matchId', authMiddleware, tournamentController.deleteDoubleEliminationMatch);
// Swiss match scores (lưu DB thay cho localStorage). API mirror với
// single-elim-matches; FE truyền thêm "poolKey" ("w-l") và "round" để DB lưu
// kèm. Sơ đồ pool được dựng động ở FE dựa trên maxParticipants + target wins/losses,
// backend chỉ lưu / lấy theo cặp (tournament_id, match_id).
router.get('/tournaments/:id/swiss-matches', tournamentController.getSwissMatches);
router.put('/tournaments/:id/swiss-matches/:matchId', authMiddleware, tournamentController.upsertSwissMatch);
router.delete('/tournaments/:id/swiss-matches/:matchId', authMiddleware, tournamentController.deleteSwissMatch);
// GET /api/tournaments/:id/round-best-of
router.get('/tournaments/:id/round-best-of', async (req, res) => {
  try {
    const { id } = req.params;
    
    const roundBestOfs = await TournamentRoundBestOf.findAll({
      where: { tournamentId: id },
      order: [['roundNumber', 'ASC']],
    });
    
    res.json(roundBestOfs);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch round best of settings.', error: error.message });
  }
});

// PUT /api/tournaments/:id/round-best-of
router.put('/tournaments/:id/round-best-of', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { roundBestOfs } = req.body;
    
    // Kiểm tra quyền creator
    const tournament = await Tournament.findByPk(id);
    if (!tournament) {
      return res.status(404).json({ message: 'Tournament not found.' });
    }
    
    if (tournament.createdBy !== req.user.id) {
      return res.status(403).json({ message: 'You are not the creator of this tournament.' });
    }
    
    // Xóa các cấu hình cũ
    await TournamentRoundBestOf.destroy({ where: { tournamentId: id } });
    
    // Tạo cấu hình mới
    if (roundBestOfs && Array.isArray(roundBestOfs) && roundBestOfs.length > 0) {
      const roundData = roundBestOfs.map(round => ({
        tournamentId: id,
        roundNumber: round.roundNumber,
        formatType: round.formatType,
        bestOf: round.bestOf,
      }));
      await TournamentRoundBestOf.bulkCreate(roundData);

      // Sync best_of của group_matches đã tồn tại + tính lại isCompleted/winner
      const groupBO = roundBestOfs.find(
        (r) => r.formatType === 'group' && Number(r.roundNumber) === 1
      )?.bestOf;
      if (groupBO) {
        const matches = await GroupMatch.findAll({ where: { tournamentId: id } });
        const neededWins = Math.ceil(groupBO / 2);
        await Promise.all(
          matches.map(async (m) => {
            const a = m.teamAScore || 0;
            const b = m.teamBScore || 0;
            let winnerId = null;
            let winnerName = null;
            if (a >= neededWins && a > b) {
              winnerId = m.teamAId;
              winnerName = m.teamAName;
            } else if (b >= neededWins && b > a) {
              winnerId = m.teamBId;
              winnerName = m.teamBName;
            }
            m.bestOf = groupBO;
            m.winnerId = winnerId;
            m.winnerName = winnerName;
            m.isCompleted = winnerId !== null;
            m.completedAt = m.isCompleted ? m.completedAt || new Date() : null;
            await m.save();
          })
        );
      }
    }
    
    res.json({ message: 'Round best of settings updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update round best of settings.', error: error.message });
  }
});

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