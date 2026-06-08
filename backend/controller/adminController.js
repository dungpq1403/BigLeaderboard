const { Op } = require('sequelize');
const User = require('../models/User');

// Whitelist các giá trị role hợp lệ — phải khớp với ENUM trong models/User.js.
// Nếu sau này thêm role mới, update cả đây để controller chấp nhận.
const VALID_ROLES = new Set(['user', 'admin']);

const adminController = {
  // GET /api/admin/users?q=&page=&pageSize=
  // Trả về danh sách user (kèm tổng count) cho trang quản trị. Hỗ trợ search
  // theo username/email/fullName để admin lọc nhanh khi có nhiều user.
  async listUsers(req, res) {
    try {
      const rawPage = parseInt(req.query.page, 10);
      const rawSize = parseInt(req.query.pageSize, 10);
      const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
      // Chặn hard-cap pageSize để tránh client cố lấy hết bảng users 1 lần.
      const pageSize = Math.min(
        100,
        Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 20
      );
      const offset = (page - 1) * pageSize;

      const q = (req.query.q || '').toString().trim();
      const where = {};
      if (q) {
        where[Op.or] = [
          { username: { [Op.like]: `%${q}%` } },
          { email: { [Op.like]: `%${q}%` } },
          { fullName: { [Op.like]: `%${q}%` } },
        ];
      }

      const { rows, count } = await User.findAndCountAll({
        where,
        attributes: [
          'id',
          'username',
          'email',
          'fullName',
          'role',
          'country',
          'createdAt',
          'restrictedUntil',
        ],
        order: [['createdAt', 'DESC']],
        limit: pageSize,
        offset,
      });

      res.json({
        users: rows,
        total: count,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(count / pageSize)),
      });
    } catch (error) {
      res.status(500).json({
        message: 'Failed to list users.',
        error: error.message,
      });
    }
  },

  // PUT /api/admin/users/:userId/role
  async updateUserRole(req, res) {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      if (!VALID_ROLES.has(role)) {
        return res
          .status(400)
          .json({ message: 'Role phải là "user" hoặc "admin".' });
      }

      // Không cho admin tự hạ quyền chính mình → tránh trường hợp lock-out
      // toàn bộ hệ thống nếu chỉ còn 1 admin và họ vô tình demote.
      if (parseInt(userId, 10) === req.user.id && role !== 'admin') {
        return res.status(400).json({
          message: 'Bạn không thể tự hạ quyền tài khoản đang đăng nhập.',
        });
      }

      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      user.role = role;
      await user.save();

      res.json({
        message: 'Cập nhật role thành công.',
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      res.status(500).json({
        message: 'Failed to update user role.',
        error: error.message,
      });
    }
  },

  // PUT /api/admin/users/:userId/restrict
  // Body: { days: number | null }
  //   - days > 0  → đặt restrictedUntil = NOW + days*24h
  //   - days === 0 hoặc null → clear restriction (cho phép user dùng lại)
  async restrictUser(req, res) {
    try {
      const { userId } = req.params;
      const { days } = req.body;

      // Cho phép unrestrict bằng cả `null`, `0`, hoặc field thiếu — đồng nhất
      // với cách FE thường gửi clear (0 hoặc null).
      const isClearing =
        days === null ||
        days === undefined ||
        Number(days) === 0;

      let restrictedUntil = null;
      if (!isClearing) {
        const numDays = Number(days);
        if (!Number.isFinite(numDays) || numDays < 0) {
          return res.status(400).json({
            message: 'Số ngày giới hạn phải là số không âm.',
          });
        }
        // Hard-cap 365 ngày để tránh vô tình ban vĩnh viễn. Nếu cần kỷ luật
        // dài hơn thì gọi nhiều lần — quyết định business, không phải kỹ thuật.
        if (numDays > 365) {
          return res.status(400).json({
            message: 'Số ngày giới hạn tối đa là 365.',
          });
        }
        restrictedUntil = new Date(Date.now() + numDays * 24 * 60 * 60 * 1000);
      }

      // Không cho self-restrict — admin sẽ vẫn cần thao tác toàn quyền; nếu
      // muốn nghỉ thì logout. Đây cũng là tuyến phòng thủ trong trường hợp
      // admin nhầm tay.
      if (parseInt(userId, 10) === req.user.id) {
        return res.status(400).json({
          message: 'Không thể giới hạn tài khoản đang đăng nhập.',
        });
      }

      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      // Không giới hạn admin khác — admin có quyền cao như nhau, BAN giữa
      // admin sẽ tạo loop xung đột. Muốn ban thì demote rồi mới ban.
      if (user.role === 'admin' && !isClearing) {
        return res.status(400).json({
          message: 'Không thể giới hạn tài khoản admin.',
        });
      }

      user.restrictedUntil = restrictedUntil;
      await user.save();

      res.json({
        message: isClearing
          ? 'Đã bỏ giới hạn user.'
          : `Đã giới hạn user trong ${days} ngày.`,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          restrictedUntil: user.restrictedUntil,
        },
      });
    } catch (error) {
      res.status(500).json({
        message: 'Failed to update restriction.',
        error: error.message,
      });
    }
  },

  // DELETE /api/admin/users/:userId
  async deleteUser(req, res) {
    try {
      const { userId } = req.params;

      // Không cho xóa chính mình từ admin panel — phải có ít nhất 1 admin còn
      // tồn tại; logout + xóa account bằng tay nếu thật sự cần.
      if (parseInt(userId, 10) === req.user.id) {
        return res.status(400).json({
          message: 'Không thể xóa tài khoản đang đăng nhập.',
        });
      }

      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      await user.destroy();
      res.json({ message: 'Đã xóa user.', userId: user.id });
    } catch (error) {
      res.status(500).json({
        message: 'Failed to delete user.',
        error: error.message,
      });
    }
  },
};

module.exports = adminController;
