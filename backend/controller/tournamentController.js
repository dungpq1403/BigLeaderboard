const { Op } = require('sequelize');
const Tournament = require('../models/Tournament');
const TournamentContact = require('../models/TournamentContact');
const GroupMatch = require('../models/GroupMatch');
const TournamentRoundBestOf = require('../models/TournamentRoundBestOf');
const SingleEliminationMatch = require('../models/SingleEliminationMatch');
const DoubleEliminationMatch = require('../models/DoubleEliminationMatch');
const Registration = require('../models/Registration');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');

// Tính winner từ tỉ số + bestOf theo cùng quy tắc với FE (ceil(BO/2) wins + lead).
// Trả về tên đội thắng hoặc null nếu chưa đủ điều kiện. Dùng chung cho cả
// single elimination và double elimination vì luật BO giống nhau.
function deriveBracketWinner(teamAScore, teamBScore, bestOf, teamAName, teamBName) {
  const a = Number(teamAScore) || 0;
  const b = Number(teamBScore) || 0;
  const bo = Number(bestOf) || 3;
  const need = Math.ceil(bo / 2);
  if (a >= need && a > b) return teamAName || null;
  if (b >= need && b > a) return teamBName || null;
  return null;
}

// Anchor format = vòng phân loại đầu giải. Quy tắc nghiệp vụ:
//   - Swiss và vòng bảng LOẠI TRỪ lẫn nhau (1 giải chỉ dùng 1 trong 2).
//   - Nếu có 1 anchor thì anchor đó phải đứng ở vị trí 0 trong formats.
// Validator này được dùng ở cả createTournament và updateTournament để FE/BE đồng
// nhất quy tắc; trả về object { ok, message } để caller xử lý response 400.
const ANCHOR_FORMATS = new Set(['swiss', 'group']);
const SUPPORTED_FORMATS = new Set([
  'swiss',
  'group',
  'single_elimination',
  'double_elimination',
]);

function validateFormatsOrder(formats) {
  if (!Array.isArray(formats) || formats.length === 0) {
    return { ok: false, message: 'Phải chọn ít nhất một thể thức.' };
  }

  const seen = new Set();
  let anchorCount = 0;
  let anchorIndex = -1;

  for (let i = 0; i < formats.length; i++) {
    const f = formats[i];
    if (!SUPPORTED_FORMATS.has(f)) {
      return { ok: false, message: `Thể thức không hợp lệ: "${f}".` };
    }
    if (seen.has(f)) {
      return { ok: false, message: `Thể thức "${f}" bị trùng trong danh sách.` };
    }
    seen.add(f);

    if (ANCHOR_FORMATS.has(f)) {
      anchorCount++;
      anchorIndex = i;
    }
  }

  if (anchorCount > 1) {
    return {
      ok: false,
      message: 'Không thể chọn cả Vòng Swiss và Vòng bảng trong cùng một giải đấu.',
    };
  }

  if (anchorCount === 1 && anchorIndex !== 0) {
    return {
      ok: false,
      message: 'Vòng Swiss/Vòng bảng phải nằm ở vị trí đầu tiên của chuỗi thể thức.',
    };
  }

  return { ok: true };
}

// Đồng bộ cột best_of của group_matches theo TournamentRoundBestOf
// và tính lại isCompleted/winnerId/winnerName/completedAt vì ngưỡng thắng thay đổi
// khi BO đổi (vd: 3-0 hoàn thành ở BO5 nhưng chưa hoàn thành ở BO7).
async function syncGroupMatchesBestOf(tournamentId, roundBestOfs) {
  if (!Array.isArray(roundBestOfs) || roundBestOfs.length === 0) return;

  const groupBO = roundBestOfs.find(
    (r) => r.formatType === 'group' && Number(r.roundNumber) === 1
  )?.bestOf;
  if (!groupBO) return;

  const matches = await GroupMatch.findAll({ where: { tournamentId } });
  if (matches.length === 0) return;

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
        advancementSteps, groupColumns, teamMembers, teamSubstitutes, thirdPlaceMatch, defaultBestOf, roundBestOfs // thay advancementCount bằng advancementSteps
      } = req.body;
      
      // Validation cơ bản
      if (!name || !formats || !formats.length || !startDate || !endDate || !maxParticipants || !gameId) {
        return res.status(400).json({ message: 'Missing required fields.' });
      }

      // Validate thứ tự & cấu hình các thể thức (swiss/group loại trừ + phải đứng đầu)
      const formatsCheck = validateFormatsOrder(formats);
      if (!formatsCheck.ok) {
        return res.status(400).json({ message: formatsCheck.message });
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

      if (roundBestOfs && Array.isArray(roundBestOfs) && roundBestOfs.length > 0) {
        await TournamentRoundBestOf.destroy({ where: { tournamentId: tournament.id } });
        
        const roundData = roundBestOfs.map(round => ({
          tournamentId: tournament.id,
          roundNumber: round.roundNumber,
          formatType: round.formatType,
          bestOf: round.bestOf,
        }));
        await TournamentRoundBestOf.bulkCreate(roundData);
      }

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
      await GroupMatch.destroy({ where: { tournamentId: id } });
      await SingleEliminationMatch.destroy({ where: { tournamentId: id } });
      await DoubleEliminationMatch.destroy({ where: { tournamentId: id } });
      await TournamentRoundBestOf.destroy({ where: { tournamentId: id } });
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

  async getBracketData(req, res){
    try {
      const { id } = req.params;
      
      const tournament = await Tournament.findByPk(id);
      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found.' });
      }
      
      // Lấy danh sách participants nhưng chỉ lấy thông tin cần thiết cho bảng đấu
      const registrations = await Registration.findAll({
        where: { tournamentId: id, status: 'approved' },
        attributes: ['id', 'userId', 'participantType', 'fullName', 'teamName'],
      });
      
      // Format lại dữ liệu cho bảng đấu
      const bracketParticipants = registrations.map(reg => {
        if (reg.participantType === 'team') {
          return {
            id: reg.id,
            name: reg.teamName,
            type: 'team',
          };
        } else {
          return {
            id: reg.id,
            name: reg.fullName,
            type: 'person',
          };
        }
      });
      
      // Lấy group matches nếu có
      const matches = await GroupMatch.findAll({
        where: { tournamentId: id },
        order: [['groupId', 'ASC'], ['createdAt', 'ASC']],
      });
      
      res.json({
        tournament: {
          id: tournament.id,
          name: tournament.name,
          formats: tournament.formats,
          participantType: tournament.participantType,
          groupColumns: tournament.groupColumns,
          thirdPlaceMatch: tournament.thirdPlaceMatch,
        },
        participants: bracketParticipants,
        matches: matches,
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch bracket data.', error: error.message });
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
        roundBestOfs,
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

      // Nếu request có gửi formats mới → validate trước khi update để tránh lưu
      // cấu hình bất hợp lệ (vd: [single_elim, swiss], hoặc cả swiss + group).
      if (formats !== undefined) {
        const formatsCheck = validateFormatsOrder(formats);
        if (!formatsCheck.ok) {
          return res.status(400).json({ message: formatsCheck.message });
        }
      }

      // Snapshot lại formats CŨ TRƯỚC khi update để diff sau khi đã ghi giá trị
      // mới. Cần biết user vừa BỎ thể thức nào để dọn dữ liệu trận đã sinh ra
      // theo thể thức đó (tránh dữ liệu rác/standings trống lơ lửng ở UI cũ).
      const oldFormats = Array.isArray(tournament.formats) ? [...tournament.formats] : [];

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

      // Dọn dữ liệu trận đấu khi user BỎ CHỌN một thể thức mà trước đó đã có
      // matches/scores được khởi tạo. Nếu không dọn, các bảng dữ liệu này sẽ
      // trở thành "mồ côi": không còn UI nào render chúng nhưng vẫn nằm trong DB,
      // gây nhiễu nếu sau này user thêm lại thể thức đó (matches cũ "đội mồ" hiện lên).
      const newFormatsArr = Array.isArray(tournament.formats) ? tournament.formats : [];

      // 1) Bỏ "Vòng bảng" → xoá toàn bộ cặp đấu vòng bảng đã được khởi tạo qua
      //    POST /initialize-group-matches của giải đấu này.
      if (oldFormats.includes('group') && !newFormatsArr.includes('group')) {
        await GroupMatch.destroy({ where: { tournamentId: tournament.id } });
      }

      // 2) Bỏ "Đấu loại trực tiếp" → xoá tỉ số đã lưu cho các trận single elim.
      //    Bracket được dựng động từ participants, nên chỉ có scores là persisted.
      if (oldFormats.includes('single_elimination') && !newFormatsArr.includes('single_elimination')) {
        await SingleEliminationMatch.destroy({ where: { tournamentId: tournament.id } });
      }

      // 3) Bỏ "Nhánh thắng-thua" → xoá toàn bộ tỉ số đã lưu cho các trận double
      //    elim. Cấu trúc bracket được dựng động từ participants ở FE, nên chỉ
      //    có scores là persisted trong DB.
      if (oldFormats.includes('double_elimination') && !newFormatsArr.includes('double_elimination')) {
        await DoubleEliminationMatch.destroy({ where: { tournamentId: tournament.id } });
      }

      if (roundBestOfs && Array.isArray(roundBestOfs) && roundBestOfs.length > 0) {
        await TournamentRoundBestOf.destroy({ where: { tournamentId: tournament.id } });
        
        const roundData = roundBestOfs.map(round => ({
          tournamentId: tournament.id,
          roundNumber: round.roundNumber,
          formatType: round.formatType,
          bestOf: round.bestOf,
        }));
        await TournamentRoundBestOf.bulkCreate(roundData);

        // Sync group_matches.best_of theo BO mới và tính lại trạng thái hoàn thành
        await syncGroupMatchesBestOf(tournament.id, roundBestOfs);
      }
  
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

  // GET /api/tournaments/:id/group-matches
  async getGroupMatches(req, res) {
    try {
      const { id } = req.params;
      
      const matches = await GroupMatch.findAll({
        where: { tournamentId: id },
        order: [['groupId', 'ASC'], ['createdAt', 'ASC']],
      });
      
      res.json({ matches });
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch matches.', error: error.message });
    }
  },

  // PUT /api/tournaments/:id/group-matches/:matchId
  async updateGroupMatches (req, res) {
    try {
      const { id, matchId } = req.params;
      const { teamAScore, teamBScore } = req.body;

      const match = await GroupMatch.findOne({
        where: { id: matchId, tournamentId: id },
      });

      if (!match) {
        return res.status(404).json({ message: 'Match not found.' });
      }

      // Chỉ cho phép cập nhật điểm khi trận đã được đưa vào lịch (status "đang diễn ra")
      if (!match.scheduledTime) {
        return res.status(403).json({
          message: 'Trận đấu chưa được lên lịch. Hãy chọn cặp đấu sẽ diễn ra hôm nay trước.',
        });
      }

      const safeA = Number.isFinite(Number(teamAScore)) ? Math.max(0, parseInt(teamAScore, 10)) : 0;
      const safeB = Number.isFinite(Number(teamBScore)) ? Math.max(0, parseInt(teamBScore, 10)) : 0;

      // Tính lại isCompleted/winner từ bestOf lưu trong DB, không tin tưởng client
      // → tránh trường hợp 0-2 trong BO7 mà vẫn bị đánh dấu hoàn thành rồi khoá input sau F5.
      const bestOf = match.bestOf || 3;
      const neededWins = Math.ceil(bestOf / 2);

      let computedWinnerId = null;
      let computedWinnerName = null;
      if (safeA >= neededWins && safeA > safeB) {
        computedWinnerId = match.teamAId;
        computedWinnerName = match.teamAName;
      } else if (safeB >= neededWins && safeB > safeA) {
        computedWinnerId = match.teamBId;
        computedWinnerName = match.teamBName;
      }

      const isCompleted = computedWinnerId !== null;

      match.teamAScore = safeA;
      match.teamBScore = safeB;
      match.winnerId = computedWinnerId;
      match.winnerName = computedWinnerName;
      match.isCompleted = isCompleted;
      match.completedAt = isCompleted ? new Date() : null;

      await match.save();

      res.json({ message: 'Match result updated.', match });
    } catch (error) {
      res.status(500).json({ message: 'Failed to update match.', error: error.message });
    }
  },

// POST /api/tournaments/:id/group-matches/ensure
  // Body: { pairs: [{ groupId, groupName, teamAId, teamAName, teamBId, teamBName }] }
  // Tạo các trận đấu còn thiếu trong DB cho các cặp đã đăng ký (idempotent).
  // Bracket có thể bị "out of sync" khi data DB chỉ có 1 phần các cặp đấu vì lý do nào đó.
  async ensureGroupMatches(req, res) {
    try {
      const { id } = req.params;
      const { pairs } = req.body;

      if (!Array.isArray(pairs)) {
        return res.status(400).json({ message: 'pairs phải là một mảng.' });
      }

      const tournament = await Tournament.findByPk(id);
      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found.' });
      }
      if (tournament.createdBy !== req.user.id) {
        return res.status(403).json({ message: 'You are not the creator of this tournament.' });
      }

      const bestOfSetting = await TournamentRoundBestOf.findOne({
        where: { tournamentId: id, formatType: 'group', roundNumber: 1 },
      });
      const bestOf = bestOfSetting?.bestOf || 3;

      const existing = await GroupMatch.findAll({ where: { tournamentId: id } });
      const created = [];

      for (const pair of pairs) {
        if (!pair || !pair.teamAId || !pair.teamBId) continue;
        const dup = existing.find(
          (m) =>
            (m.teamAId === pair.teamAId && m.teamBId === pair.teamBId) ||
            (m.teamAId === pair.teamBId && m.teamBId === pair.teamAId)
        );
        if (dup) continue;

        const newMatch = await GroupMatch.create({
          tournamentId: id,
          groupId: pair.groupId,
          groupName: pair.groupName,
          teamAId: pair.teamAId,
          teamAName: pair.teamAName || '',
          teamBId: pair.teamBId,
          teamBName: pair.teamBName || '',
          bestOf,
          isCompleted: false,
          teamAScore: 0,
          teamBScore: 0,
        });
        created.push(newMatch);
      }

      res.json({ message: 'Ensured.', createdCount: created.length });
    } catch (error) {
      res.status(500).json({ message: 'Failed to ensure matches.', error: error.message });
    }
  },

// POST /api/tournaments/:id/group-matches/schedule
  // Body: { matchIds: number[], scheduledDate?: string (ISO) }
  // Đưa các trận từ trạng thái "chưa diễn ra" → "đang diễn ra" bằng cách set scheduledTime.
  async scheduleGroupMatches(req, res) {
    try {
      const { id } = req.params;
      const { matchIds, scheduledDate } = req.body;

      if (!Array.isArray(matchIds) || matchIds.length === 0) {
        return res.status(400).json({ message: 'Cần chọn ít nhất 1 trận.' });
      }

      const tournament = await Tournament.findByPk(id);
      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found.' });
      }
      if (tournament.createdBy !== req.user.id) {
        return res.status(403).json({ message: 'You are not the creator of this tournament.' });
      }

      const when = scheduledDate ? new Date(scheduledDate) : new Date();
      if (isNaN(when.getTime())) {
        return res.status(400).json({ message: 'Ngày lên lịch không hợp lệ.' });
      }

      // Chỉ ảnh hưởng tới các trận chưa hoàn thành và chưa có lịch
      const [affected] = await GroupMatch.update(
        { scheduledTime: when },
        {
          where: {
            id: matchIds,
            tournamentId: id,
            isCompleted: false,
            scheduledTime: null,
          },
        }
      );

      res.json({ message: 'Đã cập nhật lịch thi đấu.', scheduledCount: affected, scheduledTime: when });
    } catch (error) {
      res.status(500).json({ message: 'Failed to schedule matches.', error: error.message });
    }
  },

  // GET /api/tournaments/:id/single-elim-matches
  // Trả về toàn bộ tỉ số / cấu hình BO đã lưu cho sơ đồ đấu loại trực tiếp.
  // Endpoint công khai (không cần đăng nhập) để khán giả cũng xem được bracket.
  async getSingleEliminationMatches(req, res) {
    try {
      const { id } = req.params;

      const matches = await SingleEliminationMatch.findAll({
        where: { tournamentId: id },
        order: [['matchId', 'ASC']],
      });

      res.json({ matches });
    } catch (error) {
      res.status(500).json({
        message: 'Failed to fetch single elimination matches.',
        error: error.message,
      });
    }
  },

  // PUT /api/tournaments/:id/single-elim-matches/:matchId
  // Body: { teamAScore, teamBScore, bestOf, teamAName?, teamBName?, isThirdPlace?, invalidateMatchIds?: number[] }
  // Upsert tỉ số cho 1 trận. Nếu winner đổi, FE truyền invalidateMatchIds để
  // backend xoá toàn bộ downstream trong cùng 1 request (tránh race condition).
  async upsertSingleEliminationMatch(req, res) {
    try {
      const { id, matchId } = req.params;
      const {
        teamAScore,
        teamBScore,
        bestOf,
        teamAName,
        teamBName,
        isThirdPlace,
        invalidateMatchIds,
      } = req.body;

      const tournament = await Tournament.findByPk(id);
      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found.' });
      }
      if (tournament.createdBy !== req.user.id) {
        return res
          .status(403)
          .json({ message: 'You are not the creator of this tournament.' });
      }

      const safeA = Math.max(0, parseInt(teamAScore, 10) || 0);
      const safeB = Math.max(0, parseInt(teamBScore, 10) || 0);
      const safeBO = Math.max(1, parseInt(bestOf, 10) || 3);

      const need = Math.ceil(safeBO / 2);
      if (safeA > need || safeB > need) {
        return res.status(400).json({
          message: `Điểm không được vượt quá ${need} (BO${safeBO}).`,
        });
      }
      if (safeA === need && safeB === need) {
        return res
          .status(400)
          .json({ message: 'Cả 2 đội không thể cùng đạt mức thắng.' });
      }

      const winnerName = deriveBracketWinner(
        safeA,
        safeB,
        safeBO,
        teamAName,
        teamBName
      );
      const isCompleted = winnerName !== null;

      const numericMatchId = parseInt(matchId, 10);
      if (!Number.isFinite(numericMatchId) || numericMatchId < 1) {
        return res.status(400).json({ message: 'matchId không hợp lệ.' });
      }

      const [row] = await SingleEliminationMatch.findOrCreate({
        where: { tournamentId: id, matchId: numericMatchId },
        defaults: {
          tournamentId: id,
          matchId: numericMatchId,
          teamAName: teamAName || null,
          teamBName: teamBName || null,
          teamAScore: safeA,
          teamBScore: safeB,
          bestOf: safeBO,
          winnerName,
          isCompleted,
          isThirdPlace: !!isThirdPlace,
          completedAt: isCompleted ? new Date() : null,
        },
      });

      row.teamAName = teamAName || null;
      row.teamBName = teamBName || null;
      row.teamAScore = safeA;
      row.teamBScore = safeB;
      row.bestOf = safeBO;
      row.winnerName = winnerName;
      row.isCompleted = isCompleted;
      if (typeof isThirdPlace === 'boolean') row.isThirdPlace = isThirdPlace;
      row.completedAt = isCompleted ? row.completedAt || new Date() : null;
      await row.save();

      // Cascade xoá downstream nếu FE chỉ định (winner đổi → các trận sau không
      // còn ý nghĩa, FE đã tính sẵn danh sách bằng BFS xuôi)
      if (Array.isArray(invalidateMatchIds) && invalidateMatchIds.length > 0) {
        const ids = invalidateMatchIds
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n !== numericMatchId);
        if (ids.length > 0) {
          await SingleEliminationMatch.destroy({
            where: { tournamentId: id, matchId: ids },
          });
        }
      }

      res.json({ message: 'Match saved.', match: row });
    } catch (error) {
      res.status(500).json({
        message: 'Failed to save single elimination match.',
        error: error.message,
      });
    }
  },

  // DELETE /api/tournaments/:id/single-elim-matches/:matchId
  // Body: { invalidateMatchIds?: number[] }
  // Xoá kết quả 1 trận + toàn bộ downstream do FE chỉ định.
  async deleteSingleEliminationMatch(req, res) {
    try {
      const { id, matchId } = req.params;
      const { invalidateMatchIds } = req.body || {};

      const tournament = await Tournament.findByPk(id);
      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found.' });
      }
      if (tournament.createdBy !== req.user.id) {
        return res
          .status(403)
          .json({ message: 'You are not the creator of this tournament.' });
      }

      const numericMatchId = parseInt(matchId, 10);
      if (!Number.isFinite(numericMatchId) || numericMatchId < 1) {
        return res.status(400).json({ message: 'matchId không hợp lệ.' });
      }

      const idsToDelete = new Set([numericMatchId]);
      if (Array.isArray(invalidateMatchIds)) {
        invalidateMatchIds.forEach((n) => {
          const v = parseInt(n, 10);
          if (Number.isFinite(v)) idsToDelete.add(v);
        });
      }

      const deletedCount = await SingleEliminationMatch.destroy({
        where: { tournamentId: id, matchId: Array.from(idsToDelete) },
      });

      res.json({ message: 'Match deleted.', deletedCount });
    } catch (error) {
      res.status(500).json({
        message: 'Failed to delete single elimination match.',
        error: error.message,
      });
    }
  },

  // GET /api/tournaments/:id/double-elim-matches
  // Trả về toàn bộ tỉ số / cấu hình BO đã lưu cho sơ đồ double elimination.
  // Endpoint công khai (không cần đăng nhập) để khán giả cũng xem được bracket,
  // đồng bộ hành vi với single-elim-matches.
  async getDoubleEliminationMatches(req, res) {
    try {
      const { id } = req.params;

      const matches = await DoubleEliminationMatch.findAll({
        where: { tournamentId: id },
        order: [['matchId', 'ASC']],
      });

      res.json({ matches });
    } catch (error) {
      res.status(500).json({
        message: 'Failed to fetch double elimination matches.',
        error: error.message,
      });
    }
  },

  // PUT /api/tournaments/:id/double-elim-matches/:matchId
  // Body: { teamAScore, teamBScore, bestOf, teamAName?, teamBName?, bracket?, invalidateMatchIds?: number[] }
  // Upsert tỉ số cho 1 trận DE. Nếu winner đổi, FE truyền invalidateMatchIds để
  // backend xoá toàn bộ downstream (cả WB, LB, GF) trong cùng 1 request — tránh
  // race condition giữa save và cascade-delete.
  async upsertDoubleEliminationMatch(req, res) {
    try {
      const { id, matchId } = req.params;
      const {
        teamAScore,
        teamBScore,
        bestOf,
        teamAName,
        teamBName,
        bracket,
        invalidateMatchIds,
      } = req.body;

      const tournament = await Tournament.findByPk(id);
      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found.' });
      }
      if (tournament.createdBy !== req.user.id) {
        return res
          .status(403)
          .json({ message: 'You are not the creator of this tournament.' });
      }

      const safeA = Math.max(0, parseInt(teamAScore, 10) || 0);
      const safeB = Math.max(0, parseInt(teamBScore, 10) || 0);
      const safeBO = Math.max(1, parseInt(bestOf, 10) || 3);

      const need = Math.ceil(safeBO / 2);
      if (safeA > need || safeB > need) {
        return res.status(400).json({
          message: `Điểm không được vượt quá ${need} (BO${safeBO}).`,
        });
      }
      if (safeA === need && safeB === need) {
        return res
          .status(400)
          .json({ message: 'Cả 2 đội không thể cùng đạt mức thắng.' });
      }

      const numericMatchId = parseInt(matchId, 10);
      if (!Number.isFinite(numericMatchId) || numericMatchId < 1) {
        return res.status(400).json({ message: 'matchId không hợp lệ.' });
      }

      // Chỉ chấp nhận 3 giá trị bracket hợp lệ; còn lại → null (không chặn lưu
      // để tương thích với các phiên bản FE chưa gửi field này).
      const safeBracket =
        bracket === 'WB' || bracket === 'LB' || bracket === 'GF' ? bracket : null;

      const winnerName = deriveBracketWinner(
        safeA,
        safeB,
        safeBO,
        teamAName,
        teamBName
      );
      const isCompleted = winnerName !== null;

      const [row] = await DoubleEliminationMatch.findOrCreate({
        where: { tournamentId: id, matchId: numericMatchId },
        defaults: {
          tournamentId: id,
          matchId: numericMatchId,
          bracket: safeBracket,
          teamAName: teamAName || null,
          teamBName: teamBName || null,
          teamAScore: safeA,
          teamBScore: safeB,
          bestOf: safeBO,
          winnerName,
          isCompleted,
          completedAt: isCompleted ? new Date() : null,
        },
      });

      row.bracket = safeBracket || row.bracket;
      row.teamAName = teamAName || null;
      row.teamBName = teamBName || null;
      row.teamAScore = safeA;
      row.teamBScore = safeB;
      row.bestOf = safeBO;
      row.winnerName = winnerName;
      row.isCompleted = isCompleted;
      row.completedAt = isCompleted ? row.completedAt || new Date() : null;
      await row.save();

      // Cascade xoá downstream nếu FE chỉ định. Với DE, downstream có thể bao
      // gồm cả LB (vì WB loser sang LB) lẫn GF — FE đã tính sẵn danh sách qua
      // BFS theo feed type winner/loser.
      if (Array.isArray(invalidateMatchIds) && invalidateMatchIds.length > 0) {
        const ids = invalidateMatchIds
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n !== numericMatchId);
        if (ids.length > 0) {
          await DoubleEliminationMatch.destroy({
            where: { tournamentId: id, matchId: ids },
          });
        }
      }

      res.json({ message: 'Match saved.', match: row });
    } catch (error) {
      res.status(500).json({
        message: 'Failed to save double elimination match.',
        error: error.message,
      });
    }
  },

  // DELETE /api/tournaments/:id/double-elim-matches/:matchId
  // Body: { invalidateMatchIds?: number[] }
  // Xoá kết quả 1 trận DE + toàn bộ downstream do FE chỉ định.
  async deleteDoubleEliminationMatch(req, res) {
    try {
      const { id, matchId } = req.params;
      const { invalidateMatchIds } = req.body || {};

      const tournament = await Tournament.findByPk(id);
      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found.' });
      }
      if (tournament.createdBy !== req.user.id) {
        return res
          .status(403)
          .json({ message: 'You are not the creator of this tournament.' });
      }

      const numericMatchId = parseInt(matchId, 10);
      if (!Number.isFinite(numericMatchId) || numericMatchId < 1) {
        return res.status(400).json({ message: 'matchId không hợp lệ.' });
      }

      const idsToDelete = new Set([numericMatchId]);
      if (Array.isArray(invalidateMatchIds)) {
        invalidateMatchIds.forEach((n) => {
          const v = parseInt(n, 10);
          if (Number.isFinite(v)) idsToDelete.add(v);
        });
      }

      const deletedCount = await DoubleEliminationMatch.destroy({
        where: { tournamentId: id, matchId: Array.from(idsToDelete) },
      });

      res.json({ message: 'Match deleted.', deletedCount });
    } catch (error) {
      res.status(500).json({
        message: 'Failed to delete double elimination match.',
        error: error.message,
      });
    }
  },

// POST /api/tournaments/:id/initialize-group-matches
  async createGroupMatches(req, res) {
    try {
      const { id } = req.params;
      const { groups, bestOf } = req.body;
      
      // Xóa các trận đấu cũ
      await GroupMatch.destroy({ where: { tournamentId: id } });
      
      // Tạo trận đấu mới cho từng bảng
      const allMatches = [];
      
      for (const group of groups) {
        const teams = group.teams;
        for (let i = 0; i < teams.length; i++) {
          for (let j = i + 1; j < teams.length; j++) {
            allMatches.push({
              tournamentId: id,
              groupId: group.id,
              groupName: group.name,
              teamAId: teams[i].id,
              teamAName: teams[i].name,
              teamBId: teams[j].id,
              teamBName: teams[j].name,
              bestOf: bestOf || 3,
              isCompleted: false,
              teamAScore: 0,
              teamBScore: 0,
            });
          }
        }
      }
      
      await GroupMatch.bulkCreate(allMatches);
      
      res.json({ message: 'Matches initialized.', count: allMatches.length });
    } catch (error) {
      res.status(500).json({ message: 'Failed to initialize matches.', error: error.message });
    }
  },
};

module.exports = tournamentController;