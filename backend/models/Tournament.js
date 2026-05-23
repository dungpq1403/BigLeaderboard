const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./User');

const Tournament = sequelize.define(
  'Tournament',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    gameId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'game_id',
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    formats: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: ['swiss'],
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_date',
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'end_date',
    },
    maxParticipants: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'max_participants',
    },
    participantType: {
      type: DataTypes.ENUM('person', 'team'),
      allowNull: false,
      defaultValue: 'person',
      field: 'participant_type',
    },
    prize: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'image_url',
    },
    createdBy: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'created_by',
    },
    formatOrder: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'format_order',
    },
    groupColumns: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'group_columns',
    },
    advancementSteps: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'advancement_steps',
    },
    teamMembers: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'team_members',
    },
    teamSubstitutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'team_substitutes',
    },
  },
  {
    tableName: 'tournaments',
    timestamps: true,
  }
);

Tournament.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });

module.exports = Tournament;