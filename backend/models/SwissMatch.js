const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Tournament = require('./Tournament');

// Lưu trữ tỉ số / cấu hình BO cho từng trận trong sơ đồ Swiss.
// Cặp (tournament_id, match_id) là duy nhất: match_id là id nội bộ do FE sinh ra
// dựa trên thứ tự duyệt các pool (0-0, 1-0, 0-1, 2-0, 1-1, 0-2, ...) — backend
// không cần biết cấu trúc bracket, chỉ cần lưu/lấy theo cặp khoá này (giống
// SingleEliminationMatch / DoubleEliminationMatch).
//
// Ghi chú thiết kế:
//  - poolKey ("w-l") và round lưu thêm để debug / thống kê nhanh, KHÔNG phải khoá.
//  - teamAName / teamBName / winnerName lưu snapshot tên đội tại thời điểm nhập
//    tỉ số → dùng cho hiển thị nhanh ở các trang khác (lịch sử, leaderboard).
//  - isCompleted suy ra ở backend từ score + bestOf để không tin tưởng client.
//  - Khi user huỷ kết quả 1 trận, FE gọi PUT/DELETE kèm danh sách downstream cần
//    xoá (BFS xuôi qua đồ thị pool) để đảm bảo nhất quán toàn bộ nhánh.
const SwissMatch = sequelize.define(
  'SwissMatch',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    tournamentId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'tournament_id',
    },
    matchId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'match_id',
    },
    poolKey: {
      // Định dạng "w-l", ví dụ "0-0", "1-0", "2-1". Cho phép NULL để tương thích
      // với client cũ chưa gửi field này.
      type: DataTypes.STRING(8),
      allowNull: true,
      field: 'pool_key',
    },
    round: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'round',
    },
    teamAName: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'team_a_name',
    },
    teamBName: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'team_b_name',
    },
    teamAScore: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'team_a_score',
    },
    teamBScore: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'team_b_score',
    },
    bestOf: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'best_of',
    },
    winnerName: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'winner_name',
    },
    isCompleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_completed',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
  },
  {
    tableName: 'swiss_matches',
    timestamps: true,
    indexes: [
      {
        unique: true,
        name: 'unique_swiss_match_per_tournament',
        fields: ['tournament_id', 'match_id'],
      },
      {
        name: 'idx_swiss_match_tournament',
        fields: ['tournament_id'],
      },
    ],
  }
);

SwissMatch.belongsTo(Tournament, {
  as: 'tournament',
  foreignKey: 'tournamentId',
});

module.exports = SwissMatch;
