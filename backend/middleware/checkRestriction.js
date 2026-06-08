const User = require('../models/User');

/**
 * Trả về `true` nếu `restrictedUntil` còn nằm ở tương lai → user đang bị giới
 * hạn. Tách thành helper để controller / service khác (vd. socket sau này) có
 * thể tái sử dụng cùng quy tắc.
 */
function isUserRestricted(restrictedUntil) {
  if (!restrictedUntil) return false;
  const until = new Date(restrictedUntil).getTime();
  if (Number.isNaN(until)) return false;
  return until > Date.now();
}

/**
 * Middleware chặn các action ghi (tạo giải đấu, đăng ký giải đấu) của các user
 * đang bị admin giới hạn.
 *
 * - Phải đặt SAU `authMiddleware` để có `req.user`.
 * - Đọc lại `restrictedUntil` mới nhất từ DB thay vì tin vào field trong JWT —
 *   tránh trường hợp user đăng nhập từ trước khi bị giới hạn vẫn dùng được
 *   token cũ. Trả 403 + message rõ ràng kèm `restrictedUntil` để FE hiển thị.
 */
const checkRestriction = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'restrictedUntil'],
    });

    if (!user) {
      return res.status(401).json({ message: 'User not found.' });
    }

    if (isUserRestricted(user.restrictedUntil)) {
      return res.status(403).json({
        message:
          'Tài khoản của bạn đang bị giới hạn — không thể tạo hoặc đăng ký giải đấu.',
        restrictedUntil: user.restrictedUntil,
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({ message: 'Restriction check failed.' });
  }
};

module.exports = checkRestriction;
module.exports.isUserRestricted = isUserRestricted;
