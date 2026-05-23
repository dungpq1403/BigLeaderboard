const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const gameController = require('../controller/gameController');
const gameProfileController = require('../controller/gameProfileController');
const enkaController = require('../controller/enkaController');

// Game routes (duplicate of api.js — kept for enka route module consumers)
router.get('/games', gameController.getAllGames);

// Game profile routes
router.get('/users/:userId/game-profiles', gameProfileController.getGameProfiles);
router.post('/users/:userId/game-profiles', authMiddleware, gameProfileController.addGameProfile);
router.delete('/users/:userId/game-profiles/:gameId', authMiddleware, gameProfileController.deleteGameProfile);
router.post('/users/:userId/game-profiles/:gameId/sync', authMiddleware, gameProfileController.syncGameProfile);

// Enka routes
router.get('/enka/avatar/:avatarId', enkaController.getAvatar);

module.exports = router;