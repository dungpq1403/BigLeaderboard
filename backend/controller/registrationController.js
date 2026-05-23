const Registration = require('../models/Registration');
const Tournament = require('../models/Tournament');
const normalizeEmail = (email) => (email ? String(email).trim().toLowerCase() : '');
const normalizePhone = (phone) => (phone ? String(phone).replace(/[^0-9]/g, '') : '');

const parseJsonArray = (value) => {
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
};

const collectContactsFromRegistration = (reg) => {
  const emails = new Set();
  const phones = new Set();

  if (reg.email) emails.add(normalizeEmail(reg.email));
  if (reg.phone) phones.add(normalizePhone(reg.phone));

  for (const member of parseJsonArray(reg.teamMembers)) {
    if (member?.email) emails.add(normalizeEmail(member.email));
    if (member?.phone) phones.add(normalizePhone(member.phone));
  }
  for (const sub of parseJsonArray(reg.teamSubstitutes)) {
    if (sub?.email) emails.add(normalizeEmail(sub.email));
    if (sub?.phone) phones.add(normalizePhone(sub.phone));
  }

  return { emails, phones };
};

const findDuplicateContactsInTournament = async (tournamentId, emailsToCheck, phonesToCheck) => {
  const emailSet = new Set(emailsToCheck.map(normalizeEmail).filter(Boolean));
  const phoneSet = new Set(phonesToCheck.map(normalizePhone).filter(Boolean));

  if (emailSet.size === 0 && phoneSet.size === 0) {
    return { duplicateEmails: [], duplicatePhones: [] };
  }

  const registrations = await Registration.findAll({
    where: { tournamentId },
  });

  const duplicateEmails = [];
  const duplicatePhones = [];

  for (const reg of registrations) {
    const { emails, phones } = collectContactsFromRegistration(reg.toJSON());

    for (const email of emailSet) {
      if (emails.has(email)) duplicateEmails.push(email);
    }
    for (const phone of phoneSet) {
      if (phones.has(phone)) duplicatePhones.push(phone);
    }
  }

  return {
    duplicateEmails: [...new Set(duplicateEmails)],
    duplicatePhones: [...new Set(duplicatePhones)],
  };
};

const registrationController = {
  // POST /api/tournaments/:id/register
  async registerTournament(req, res) {
    try {
      const { id } = req.params;
      const { 
        participantType,
        // Dữ liệu cho cá nhân
        username, fullName, birthDate, phone, email, country,
        // Dữ liệu cho đội
        teamName, members, substitutes
      } = req.body;
      
      // 1. Kiểm tra giải đấu tồn tại
      const tournament = await Tournament.findByPk(id);
      if (!tournament) {
        return res.status(404).json({ message: 'Giải đấu không tồn tại.' });
      }
      
      // 2. Kiểm tra giải đấu còn nhận đăng ký không
      const now = new Date();
      const startDate = new Date(tournament.startDate);
      if (now > startDate) {
        return res.status(400).json({ message: 'Giải đấu đã bắt đầu, không thể đăng ký thêm.' });
      }
      
      // 3. Kiểm tra số lượng đăng ký hiện tại
      const currentRegistrations = await Registration.count({
        where: { tournamentId: id }
      });
      
      if (currentRegistrations >= tournament.maxParticipants) {
        return res.status(400).json({ 
          message: `Giải đấu đã đạt giới hạn ${tournament.maxParticipants} ${tournament.participantType === 'person' ? 'người' : 'đội'}.` 
        });
      }
      
      // 4. Kiểm tra user đã đăng ký giải này chưa
      const existingRegistration = await Registration.findOne({
        where: {
          tournamentId: id,
          userId: req.user.id,
        },
      });
      
      if (existingRegistration) {
        return res.status(400).json({ message: 'Bạn đã đăng ký giải đấu này rồi.' });
      }
      
      // ==================== ĐĂNG KÝ CÁ NHÂN ====================
      if (participantType === 'person' || tournament.participantType === 'person') {
        // Validation dữ liệu
        if (!username || !fullName || !birthDate || !phone || !email || !country) {
          return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin.' });
        }
        
        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ message: 'Email không hợp lệ.' });
        }
        
        // Validate phone
        const phoneRegex = /^[0-9]{9,12}$/;
        if (!phoneRegex.test(phone.replace(/[^0-9]/g, ''))) {
          return res.status(400).json({ message: 'Số điện thoại không hợp lệ (9-12 số).' });
        }
        
        const normalizedEmail = normalizeEmail(email);
        const normalizedPhone = normalizePhone(phone);

        const { duplicateEmails, duplicatePhones } = await findDuplicateContactsInTournament(
          id,
          [normalizedEmail],
          [normalizedPhone]
        );

        if (duplicateEmails.length > 0) {
          return res.status(400).json({ message: 'Email này đã được đăng ký cho giải đấu này.' });
        }

        if (duplicatePhones.length > 0) {
          return res.status(400).json({ message: 'Số điện thoại này đã được đăng ký cho giải đấu này.' });
        }

        // Tạo registration cho cá nhân
        const registration = await Registration.create({
          tournamentId: id,
          userId: req.user.id,
          username,
          fullName,
          birthDate,
          phone: normalizedPhone,
          email: normalizedEmail,
          country,
          participantType: 'person',
          status: 'pending',
          registeredAt: new Date(),
        });
        
        return res.status(201).json({
          message: 'Đăng ký thành công!',
          registration: {
            id: registration.id,
            tournamentId: registration.tournamentId,
            userId: registration.userId,
            fullName: registration.fullName,
            email: registration.email,
            phone: registration.phone,
            status: registration.status,
          },
        });
      }
      
      // ==================== ĐĂNG KÝ ĐỘI ====================
      if (participantType === 'team' || tournament.participantType === 'team') {
        // Kiểm tra giải đấu có cấu hình đội không
        if (!tournament.teamMembers || tournament.teamMembers <= 0) {
          return res.status(400).json({ 
            message: 'Giải đấu này chưa được cấu hình số lượng thành viên trong đội.' 
          });
        }
        
        // Validation tên đội
        if (!teamName || !teamName.trim()) {
          return res.status(400).json({ message: 'Tên đội là bắt buộc.' });
        }
        
        // Kiểm tra tên đội đã tồn tại trong giải đấu chưa
        const existingTeamName = await Registration.findOne({
          where: {
            tournamentId: id,
            teamName: teamName.trim(),
          },
        });
        
        if (existingTeamName) {
          return res.status(400).json({ message: 'Tên đội đã được đăng ký cho giải đấu này.' });
        }
        
        // Validation thành viên chính
        if (!members || !Array.isArray(members)) {
          return res.status(400).json({ message: 'Thông tin thành viên chính không hợp lệ.' });
        }
        
        if (members.length !== tournament.teamMembers) {
          return res.status(400).json({ 
            message: `Đội phải có đúng ${tournament.teamMembers} thành viên chính. Hiện tại có ${members.length} thành viên.` 
          });
        }
        
        // Validation dự bị
        if (substitutes && substitutes.length > (tournament.teamSubstitutes || 0)) {
          return res.status(400).json({ 
            message: `Số dự bị không được vượt quá ${tournament.teamSubstitutes || 0}.` 
          });
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^[0-9]{9,12}$/;
        const allEmails = [];
        const allPhones = [];
        
        // Validate từng thành viên chính
        for (let i = 0; i < members.length; i++) {
          const member = members[i];
          
          if (!member.fullName || !member.fullName.trim()) {
            return res.status(400).json({ 
              message: `Họ tên thành viên chính thứ ${i + 1} là bắt buộc.` 
            });
          }
          
          if (!member.birthDate) {
            return res.status(400).json({ 
              message: `Ngày sinh thành viên chính thứ ${i + 1} là bắt buộc.` 
            });
          }
          
          if (!member.email || !member.email.trim()) {
            return res.status(400).json({ 
              message: `Email thành viên chính thứ ${i + 1} là bắt buộc.` 
            });
          }
          
          if (!emailRegex.test(member.email)) {
            return res.status(400).json({ 
              message: `Email thành viên chính thứ ${i + 1} không hợp lệ.` 
            });
          }
          
          if (!member.phone || !member.phone.trim()) {
            return res.status(400).json({ 
              message: `Số điện thoại thành viên chính thứ ${i + 1} là bắt buộc.` 
            });
          }
          
          const cleanPhone = member.phone.replace(/[^0-9]/g, '');
          if (!phoneRegex.test(cleanPhone)) {
            return res.status(400).json({ 
              message: `Số điện thoại thành viên chính thứ ${i + 1} không hợp lệ (9-12 số).` 
            });
          }
          
          if (!member.country) {
            return res.status(400).json({ 
              message: `Đất nước thành viên chính thứ ${i + 1} là bắt buộc.` 
            });
          }
          
          allEmails.push(member.email.toLowerCase());
          allPhones.push(cleanPhone);
        }
        
        // Validate từng dự bị (nếu có)
        if (substitutes && substitutes.length > 0) {
          for (let i = 0; i < substitutes.length; i++) {
            const sub = substitutes[i];
            
            // Nếu có nhập thông tin thì validate
            if (sub.fullName && sub.fullName.trim()) {
              if (sub.email && !emailRegex.test(sub.email)) {
                return res.status(400).json({ 
                  message: `Email dự bị thứ ${i + 1} không hợp lệ.` 
                });
              }
              
              if (sub.phone) {
                const cleanPhone = sub.phone.replace(/[^0-9]/g, '');
                if (!phoneRegex.test(cleanPhone)) {
                  return res.status(400).json({ 
                    message: `Số điện thoại dự bị thứ ${i + 1} không hợp lệ (9-12 số).` 
                  });
                }
                if (sub.phone) allPhones.push(cleanPhone);
              }
              
              if (sub.email) allEmails.push(sub.email.toLowerCase());
            }
          }
        }
        
        const { duplicateEmails, duplicatePhones } = await findDuplicateContactsInTournament(
          id,
          allEmails,
          allPhones
        );

        if (duplicateEmails.length > 0) {
          return res.status(400).json({
            message: `Các email ${duplicateEmails.join(', ')} đã được đăng ký cho giải đấu này.`,
          });
        }

        if (duplicatePhones.length > 0) {
          return res.status(400).json({
            message: `Các số điện thoại ${duplicatePhones.join(', ')} đã được đăng ký cho giải đấu này.`,
          });
        }
        
        // Lưu thông tin đại diện (thành viên 1) vào các cột bắt buộc của bảng registrations
        const captain = members[0];
        const captainPhone = captain.phone.replace(/[^0-9]/g, '');
        const captainEmail = captain.email.toLowerCase();

        // Tạo registration cho đội
        const registration = await Registration.create({
          tournamentId: id,
          userId: req.user.id,
          username: req.user.username,
          fullName: captain.fullName.trim(),
          birthDate: captain.birthDate,
          phone: captainPhone,
          email: captainEmail,
          country: captain.country,
          teamName: teamName.trim(),
          participantType: 'team',
          teamMembers: members.map(m => ({
            fullName: m.fullName,
            birthDate: m.birthDate,
            email: m.email.toLowerCase(),
            phone: m.phone.replace(/[^0-9]/g, ''),
            country: m.country,
          })),
          teamSubstitutes: substitutes ? substitutes.map(s => ({
            fullName: s.fullName || '',
            birthDate: s.birthDate || '',
            email: s.email ? s.email.toLowerCase() : '',
            phone: s.phone ? s.phone.replace(/[^0-9]/g, '') : '',
            country: s.country || '',
          })) : [],
          status: 'pending',
          registeredAt: new Date(),
        });
        
        return res.status(201).json({
          message: 'Đăng ký đội thành công!',
          registration: {
            id: registration.id,
            tournamentId: registration.tournamentId,
            userId: registration.userId,
            teamName: registration.teamName,
            participantType: registration.participantType,
            teamMembersCount: registration.teamMembers?.length || 0,
            teamSubstitutesCount: registration.teamSubstitutes?.length || 0,
            status: registration.status,
          },
        });
      }
      
      // Nếu không xác định được loại đăng ký
      return res.status(400).json({ message: 'Loại đăng ký không hợp lệ.' });
      
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: 'Đăng ký thất bại.', error: error.message });
    }
  },

  // GET /api/tournaments/:id/registration-status
  async getRegistrationStatus(req, res) {
    try {
      const { id } = req.params;
      
      const registration = await Registration.findOne({
        where: {
          tournamentId: id,
          userId: req.user.id,
        },
      });
      
      if (!registration) {
        return res.json({ status: 'not_registered' });
      }
      
      res.json({ status: registration.status });
    } catch (error) {
      res.status(500).json({ message: 'Failed to check registration status.' });
    }
  },

  // Thêm vào registrationController.js

  // DELETE /api/tournaments/:id/cancel-registration
  async cancelRegistration(req, res) {
    try {
      const { id } = req.params;
      
      // Tìm registration
      const registration = await Registration.findOne({
        where: {
          tournamentId: id,
          userId: req.user.id,
        },
      });
      
      if (!registration) {
        return res.status(404).json({ message: 'Bạn chưa đăng ký giải đấu này.' });
      }
      
      // Xóa registration
      await registration.destroy();
      
      res.json({ 
        message: 'Đã hủy đăng ký thành công.',
        status: 'cancelled'
      });
    } catch (error) {
      res.status(500).json({ message: 'Hủy đăng ký thất bại.', error: error.message });
    }
  },

  // GET /api/tournaments/:id/check-registration - Kiểm tra trạng thái đăng ký (không cần auth nếu không có user)
  async checkRegistrationStatus(req, res) {
    try {
      const { id } = req.params;
      
      // Nếu không có user (chưa đăng nhập)
      if (!req.user) {
        return res.json({ 
          isRegistered: false, 
          status: 'not_registered',
          isLoggedIn: false 
        });
      }
      
      const registration = await Registration.findOne({
        where: {
          tournamentId: id,
          userId: req.user.id,
        },
      });
      
      if (!registration) {
        return res.json({ 
          isRegistered: false, 
          status: 'not_registered',
          isLoggedIn: true
        });
      }
      
      res.json({ 
        isRegistered: true, 
        status: registration.status,
        isLoggedIn: true,
        registrationId: registration.id
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to check registration status.' });
    }
  },
};

module.exports = registrationController;