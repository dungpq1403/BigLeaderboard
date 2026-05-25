const { Op } = require('sequelize');
const Tournament = require('../models/Tournament');
const TournamentContact = require('../models/TournamentContact');
const Registration = require('../models/Registration');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');

const tournamentController = {
  // GET /api/tournaments/:id
  async getTournamentById(req, res) {
    try {
      const { id } = req.params;
      
      const tournament = await Tournament.findByPk(id);
      
      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found.' });
      }
      
      const creator = await User.findByPk(tournament.createdBy, {
        attributes: ['id', 'username', 'fullName'],
      });
      
      const result = tournament.toJSON();
      result.creator = creator;
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch tournament.', error: error.message });
    }
  },

  // GET /api/tournaments/search
  async searchTournaments(req, res) {
    try {
      const { q } = req.query;
      
      if (!q || q.trim() === '') {
        return res.json([]);
      }
      
      const tournaments = await Tournament.findAll({
        where: {
          [Op.or]: [
            { name: { [Op.like]: `%${q}%` } },
          ],
        },
        order: [['createdAt', 'DESC']],
        limit: 10,
      });
      
      const userIds = [...new Set(tournaments.map(t => t.createdBy))];
      const users = await User.findAll({
        where: { id: userIds },
        attributes: ['id', 'username', 'fullName'],
      });
      
      const userMap = {};
      users.forEach(user => {
        userMap[user.id] = user;
      });
      
      const results = tournaments.map(tournament => ({
        ...tournament.toJSON(),
        creator: userMap[tournament.createdBy] || null,
      }));
      
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: 'Search failed.', error: error.message });
    }
  },

  // GET /api/games/:gameId/tournaments
  async getTournamentsByGame(req, res) {
    try {
      const { gameId } = req.params;
      
      const tournaments = await Tournament.findAll({
        where: { gameId },
        order: [['start_date', 'DESC']],
      });
      
      res.json(tournaments);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch tournaments.', error: error.message });
    }
  },

  // POST /api/tournaments
  async createTournament(req, res) {
     try {
      const { 
        name, formats, startDate, endDate, maxParticipants, 
        participantType, prize, description, imageUrl, gameId, contacts,
        advancementSteps, groupColumns, teamMembers, teamSubstitutes, thirdPlaceMatch // thay advancementCount bằng advancementSteps
      } = req.body;
      
      // Validation cơ bản
      if (!name || !formats || !formats.length || !startDate || !endDate || !maxParticipants || !gameId) {
        return res.status(400).json({ message: 'Missing required fields.' });
      }
      // Trong POST /tournaments và PUT /tournaments/:id
      if (participantType === 'team') {
        if (!teamMembers || teamMembers < 1) {
          return res.status(400).json({ message: 'Số thành viên trong đội phải lớn hơn 0.' });
        }
        if (teamMembers > 50) {
          return res.status(400).json({ message: 'Số thành viên trong đội không được vượt quá 50.' });
        }
        if (teamSubstitutes && teamSubstitutes < 0) {
          return res.status(400).json({ message: 'Số dự bị không được âm.' });
        }
        if (teamSubstitutes && teamSubstitutes > 20) {
          return res.status(400).json({ message: 'Số dự bị không được vượt quá 20.' });
        }
      }
      
      const tournament = await Tournament.create({
        gameId,
        name,
        formats,                      // mảng đã được sắp xếp theo thứ tự
        startDate,
        endDate,
        maxParticipants,
        participantType: participantType || 'person',
        prize: prize || 0,
        description: description || '',
        imageUrl: imageUrl || '',
        createdBy: req.user.id,
        formatOrder: formats,         // lưu lại thứ tự
        advancementSteps: advancementSteps || null,
        groupColumns: groupColumns || null,
        teamMembers: teamMembers || null,
        teamSubstitutes: teamSubstitutes || null,
        thirdPlaceMatch: thirdPlaceMatch || false,
      });

      // Xử lý contacts như cũ
      if (contacts && Array.isArray(contacts) && contacts.length > 0) {
        const contactData = contacts.map(contact => ({
          tournamentId: tournament.id,
          platform: contact.platform,
          contact: contact.contact,
        }));
        await TournamentContact.bulkCreate(contactData);
      }
      
      res.status(201).json({ message: 'Tournament created successfully.', tournament });
    } catch (error) {
      res.status(500).json({ message: 'Failed to create tournament.', error: error.message });
    }
  },

  // DELETE /api/tournaments/:id
  async deleteTournament(req, res) {
    try {
      const { id } = req.params;
      
      const tournament = await Tournament.findByPk(id);
      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found.' });
      }
      
      if (tournament.createdBy !== req.user.id) {
        return res.status(403).json({ message: 'You are not the creator of this tournament.' });
      }
      
      if (tournament.imageUrl) {
        const imagePath = path.join(__dirname, '../../frontend/public', tournament.imageUrl);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      
      await Registration.destroy({ where: { tournamentId: id } });
      await TournamentContact.destroy({ where: { tournamentId: id } });
      await tournament.destroy();
      
      res.json({ message: 'Tournament deleted successfully.' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete tournament.', error: error.message });
    }
  },

  // GET /api/tournaments/:id/contacts
  async getTournamentContacts(req, res) {
    try {
      const { id } = req.params;
      const contacts = await TournamentContact.findAll({
        where: { tournamentId: id },
      });
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch contacts.', error: error.message });
    }
  },

  // GET /api/tournaments/:id/participants
  async getParticipants(req, res) {
    try {
      const { id } = req.params;
      
      const tournament = await Tournament.findByPk(id);
      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found.' });
      }
      
      if (tournament.createdBy !== req.user.id) {
        return res.status(403).json({ message: 'You are not the creator of this tournament.' });
      }
      
      const participants = await Registration.findAll({
        where: { tournamentId: id },
        order: [['registeredAt', 'ASC']],
      });
      
      // Parse JSON fields cho teamMembers và teamSubstitutes
      const parsedParticipants = participants.map(p => {
        const plain = p.toJSON();
        if (plain.teamMembers && typeof plain.teamMembers === 'string') {
          plain.teamMembers = JSON.parse(plain.teamMembers);
        }
        if (plain.teamSubstitutes && typeof plain.teamSubstitutes === 'string') {
          plain.teamSubstitutes = JSON.parse(plain.teamSubstitutes);
        }
        return plain;
      });
      
      res.json(parsedParticipants);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch participants.', error: error.message });
    }
  },

  async updateTournament(req, res) {
    try {
      const { id } = req.params;
      const {
        name,
        formats,
        startDate,
        endDate,
        maxParticipants,
        participantType,
        prize,
        description,
        imageUrl,
        contacts,
        advancementSteps,
        groupColumns,
        teamMembers,
        teamSubstitutes,
        thirdPlaceMatch,
      } = req.body;
  
      // Tìm giải đấu
      const tournament = await Tournament.findByPk(id);
      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found.' });
      }
  
      // Kiểm tra quyền (chỉ creator mới được sửa)
      if (tournament.createdBy !== req.user.id) {
        return res.status(403).json({ message: 'You are not the creator of this tournament.' });
      }

      // Trong POST /tournaments và PUT /tournaments/:id
      if (participantType === 'team') {
        if (!teamMembers || teamMembers < 1) {
          return res.status(400).json({ message: 'Số thành viên trong đội phải lớn hơn 0.' });
        }
        if (teamMembers > 50) {
          return res.status(400).json({ message: 'Số thành viên trong đội không được vượt quá 50.' });
        }
        if (teamSubstitutes && teamSubstitutes < 0) {
          return res.status(400).json({ message: 'Số dự bị không được âm.' });
        }
        if (teamSubstitutes && teamSubstitutes > 20) {
          return res.status(400).json({ message: 'Số dự bị không được vượt quá 20.' });
        }
      }
  
      // Cập nhật thông tin cơ bản
      await tournament.update({
        name: name || tournament.name,
        formats: formats || tournament.formats,
        startDate: startDate || tournament.startDate,
        endDate: endDate || tournament.endDate,
        maxParticipants: maxParticipants || tournament.maxParticipants,
        participantType: participantType || tournament.participantType,
        prize: prize !== undefined ? prize : tournament.prize,
        description: description !== undefined ? description : tournament.description,
        imageUrl: imageUrl !== undefined ? imageUrl : tournament.imageUrl,
        formatOrder: formats || tournament.formatOrder,
        advancementSteps: advancementSteps !== undefined ? advancementSteps : tournament.advancementSteps,
        groupColumns: groupColumns !== undefined ? groupColumns : tournament.groupColumns,
        teamMembers: teamMembers !== undefined ? teamMembers : tournament.teamMembers,
        teamSubstitutes: teamSubstitutes !== undefined ? teamSubstitutes : tournament.teamSubstitutes,
        thirdPlaceMatch: thirdPlaceMatch !== undefined ? thirdPlaceMatch : tournament.thirdPlaceMatch,
      });
  
      // Cập nhật contacts (xóa cũ, thêm mới)
      if (contacts && Array.isArray(contacts)) {
        await TournamentContact.destroy({ where: { tournamentId: id } });
        const contactData = contacts
          .filter(c => c.contact && c.contact.trim() !== '')
          .map(contact => ({
            tournamentId: id,
            platform: contact.platform,
            contact: contact.contact,
          }));
        if (contactData.length > 0) {
          await TournamentContact.bulkCreate(contactData);
        }
      }
  
      // Lấy lại thông tin đã cập nhật
      const updatedTournament = await Tournament.findByPk(id);
      const updatedContacts = await TournamentContact.findAll({ where: { tournamentId: id } });
      const creator = await User.findByPk(updatedTournament.createdBy, {
        attributes: ['id', 'username', 'fullName'],
      });
  
      res.json({
        message: 'Tournament updated successfully.',
        tournament: {
          ...updatedTournament.toJSON(),
          creator,
        },
        contacts: updatedContacts,
      });
    } catch (error) {
      console.error('Update tournament error:', error);
      res.status(500).json({ message: 'Failed to update tournament.', error: error.message });
    }
  },
};

module.exports = tournamentController;