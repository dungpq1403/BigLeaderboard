const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Tournament = require('./Tournament');

const GroupMatch = sequelize.define(
  'GroupMatch',
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
    groupId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'group_id',
    },
    groupName: {
      type: DataTypes.STRING(10),
      allowNull: false,
      field: 'group_name',
    },
    teamAId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'team_a_id',
    },
    teamAName: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'team_a_name',
    },
    teamBId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'team_b_id',
    },
    teamBName: {
      type: DataTypes.STRING(200),
      allowNull: false,
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
    winnerId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'winner_id',
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
    bestOf: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
      field: 'best_of',
    },
    scheduledTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'scheduled_time',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
  },
  {
    tableName: 'group_matches',
    timestamps: true,
  }
);

GroupMatch.belongsTo(Tournament, { as: 'tournament', foreignKey: 'tournamentId' });

module.exports = GroupMatch;