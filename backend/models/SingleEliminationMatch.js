const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Tournament = require('./Tournament');

// Lưu trữ tỉ số / cấu hình BO cho từng trận trong sơ đồ đấu loại trực tiếp.
// Cặp (tournament_id, match_id) là duy nhất: match_id là id nội bộ do FE sinh ra
// dựa trên seedOrder (1..N) cho từng tournament. Backend không cần biết cấu trúc
// bracket, chỉ cần lưu/lấy theo cặp khoá này.
//
// Ghi chú thiết kế:
//  - teamAName / teamBName / winnerName lưu snapshot tên đội tại thời điểm nhập
//    tỉ số. Dùng cho hiển thị nhanh ở các trang khác (lịch sử, leaderboard).
//  - isCompleted suy ra ở backend từ score + bestOf để không tin tưởng client.
//  - Khi user huỷ kết quả 1 trận, FE gọi DELETE kèm danh sách downstream cần xoá.
const SingleEliminationMatch = sequelize.define(
  'SingleEliminationMatch',
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
      defaultValue: 3,
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
    isThirdPlace: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_third_place',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
  },
  {
    tableName: 'single_elimination_matches',
    timestamps: true,
    indexes: [
      {
        unique: true,
        name: 'unique_single_elim_match_per_tournament',
        fields: ['tournament_id', 'match_id'],
      },
      {
        name: 'idx_single_elim_match_tournament',
        fields: ['tournament_id'],
      },
    ],
  }
);

SingleEliminationMatch.belongsTo(Tournament, {
  as: 'tournament',
  foreignKey: 'tournamentId',
});

module.exports = SingleEliminationMatch;
