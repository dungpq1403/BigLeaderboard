const UserGameProfile = require('../models/UserGameProfile');
const Game = require('../models/Game');
const axios = require('axios');

const gameProfileController = {
  // GET /api/users/:userId/game-profiles
  async getGameProfiles(req, res) {
    try {
      const { userId } = req.params;
      const profiles = await UserGameProfile.findAll({
        where: { userId },
        include: [{ model: Game, as: 'game', attributes: ['id', 'name', 'slug', 'icon'] }],
      });
      res.json(profiles);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch game profiles.', error: error.message });
    }
  },

  // POST /api/users/:userId/game-profiles
  async addGameProfile(req, res) {
    try {
      const { userId } = req.params;
      const { gameId, uid } = req.body;
      
      if (parseInt(userId) !== req.user.id) {
        return res.status(403).json({ message: 'You can only add game profiles for yourself.' });
      }
      
      if (!gameId || !uid) {
        return res.status(400).json({ message: 'Game ID and UID are required.' });
      }
      
      let profileData = null;
      const game = await Game.findByPk(gameId);
      
      if (game && game.slug === 'genshin-impact') {
        try {
          const enkaResponse = await axios.get(`https://enka.network/api/uid/${uid}/`);
          profileData = {
            playerInfo: enkaResponse.data.playerInfo,
          };
        } catch (enkaError) {
          console.error('Enka API error:', enkaError.message);
        }
      }
      
      const [profile, created] = await UserGameProfile.upsert({
        userId,
        gameId,
        uid,
        profileData,
        lastSynced: new Date(),
      });
      
      res.json({
        message: created ? 'Game profile added.' : 'Game profile updated.',
        profile: {
          userId,
          gameId,
          uid,
          profileData,
          lastSynced: new Date(),
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to save game profile.', error: error.message });
    }
  },

  // DELETE /api/users/:userId/game-profiles/:gameId
  async deleteGameProfile(req, res) {
    try {
      const { userId, gameId } = req.params;
      
      if (parseInt(userId) !== req.user.id) {
        return res.status(403).json({ message: 'You can only delete your own game profiles.' });
      }
      
      const deleted = await UserGameProfile.destroy({
        where: { userId, gameId },
      });
      
      if (deleted) {
        res.json({ message: 'Game profile deleted.' });
      } else {
        res.status(404).json({ message: 'Game profile not found.' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete game profile.', error: error.message });
    }
  },

  // POST /api/users/:userId/game-profiles/:gameId/sync
  async syncGameProfile(req, res) {
    try {
      const { userId, gameId } = req.params;
      
      if (parseInt(userId) !== req.user.id) {
        return res.status(403).json({ message: 'You can only sync your own game profiles.' });
      }
      
      const profile = await UserGameProfile.findOne({
        where: { userId, gameId },
      });
      
      if (!profile) {
        return res.status(404).json({ message: 'Game profile not found.' });
      }
      
      const game = await Game.findByPk(gameId);
      let profileData = null;
      
      if (game && game.slug === 'genshin-impact') {
        try {
          const enkaResponse = await axios.get(`https://enka.network/api/uid/${profile.uid}/`);
          profileData = {
            playerInfo: enkaResponse.data.playerInfo,
          };
        } catch (enkaError) {
          console.error('Enka API error:', enkaError.message);
        }
      }
      
      profile.profileData = profileData;
      profile.lastSynced = new Date();
      await profile.save();
      
      res.json({ message: 'Synced successfully.', profile });
    } catch (error) {
      res.status(500).json({ message: 'Failed to sync.', error: error.message });
    }
  },
};

module.exports = gameProfileController;