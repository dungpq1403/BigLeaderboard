const User = require('../models/User');
const Tournament = require('../models/Tournament');
const Registration = require('../models/Registration');

const userController = {
  // GET /api/users/:id
  async getUser(req, res) {
    try {
      const { id } = req.params;
      const user = await User.findByPk(id, {
        attributes: ['id', 'username', 'email', 'fullName', 'birthDate', 'description', 'country', 'createdAt'],
      });
      
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }
      
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch user.' });
    }
  },

  // GET /api/users/email/:email
  async getUserByEmail(req, res) {
    const { email } = req.params;
    try {
      const user = await User.findOne({
        where: { email },
        attributes: ['id', 'email'],
      });
      
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }
      
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch user.' });
    }
  },

  // PUT /api/users/:id
  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { fullName, email, birthDate, description } = req.body;
      
      if (parseInt(id) !== req.user.id) {
        return res.status(403).json({ message: 'You can only edit your own profile.' });
      }
      
      const user = await User.findByPk(id);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }
      
      if (fullName) user.fullName = fullName;
      if (email) user.email = email;
      if (birthDate) user.birthDate = birthDate;
      if (description !== undefined) user.description = description;
      
      await user.save();
      
      res.json({
        message: 'Profile updated successfully.',
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          birthDate: user.birthDate,
          description: user.description,
        },
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to update profile.', error: error.message });
    }
  },

  // DELETE /api/users/:id
  async deleteUser(req, res) {
    const { id } = req.params;
    
    if (parseInt(id) !== req.user.id) {
      return res.status(403).json({ message: 'You can only delete your own account.' });
    }
    
    res.json({ id, deleted: true });
  },

  // GET /api/users/:userId/registered-tournaments
  async getRegisteredTournaments(req, res) {
    try {
      const { userId } = req.params;
      
      const registrations = await Registration.findAll({
        where: { userId },
        include: [
          {
            model: Tournament,
            as: 'tournament',
          },
        ],
        order: [['registered_at', 'DESC']],
      });
      
      const tournaments = registrations.map(reg => reg.tournament);
      
      const creatorIds = [...new Set(tournaments.map(t => t?.createdBy).filter(Boolean))];
      const creators = await User.findAll({
        where: { id: creatorIds },
        attributes: ['id', 'username', 'fullName'],
      });
      
      const creatorMap = {};
      creators.forEach(creator => {
        creatorMap[creator.id] = creator;
      });
      
      const results = tournaments.map(tournament => ({
        ...tournament.toJSON(),
        creator: creatorMap[tournament.createdBy] || null,
      }));
      
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch registered tournaments.', error: error.message });
    }
  },

  // GET /api/users/:userId/hosted-tournaments
  async getHostedTournaments(req, res) {
    try {
      const { userId } = req.params;
      
      const tournaments = await Tournament.findAll({
        where: { createdBy: userId },
        order: [['createdAt', 'DESC']],
      });
      
      const creator = await User.findByPk(userId, {
        attributes: ['id', 'username', 'fullName'],
      });
      
      const results = tournaments.map(tournament => ({
        ...tournament.toJSON(),
        creator,
      }));
      
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch hosted tournaments.', error: error.message });
    }
  },
};

module.exports = userController;