const sequelize = require('../config/db');

/**
 * Idempotent migration: thêm cột `restrictedUntil` (DATETIME, NULL) vào bảng
 * `users` nếu chưa tồn tại. Tên cột giữ nguyên camelCase để khớp với
 * convention sẵn có của User model (các cột khác cũng là camelCase: fullName,
 * birthDate, ...).
 *
 * Auto-call ở `index.js` lúc khởi động → người dev chỉ cần pull code, không
 * phải chạy thủ công migration nào.
 */
async function addUserRestrictedUntilColumn() {
  try {
    const [rows] = await sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'restrictedUntil'
    `);

    if (rows.length > 0) return;

    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN restrictedUntil DATETIME NULL DEFAULT NULL AFTER role
    `);
    console.log('Added restrictedUntil column to users.');
  } catch (error) {
    console.error('Failed to add restrictedUntil column:', error.message);
  }
}

module.exports = addUserRestrictedUntilColumn;
