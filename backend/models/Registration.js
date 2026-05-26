// backend/models/Registration.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Tournament = require('./Tournament');

const Registration = sequelize.define(
  'Registration',
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
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'user_id',
    },
    participantType: {
      type: DataTypes.ENUM('person', 'team'),
      allowNull: false,
      defaultValue: 'person',
      field: 'participant_type',
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    fullName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'full_name',
    },
    birthDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'birth_date',
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        isEmail: true,
      },
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('approved', 'cancelled'),
      allowNull: false,
      defaultValue: 'approved',
    },
    teamName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'team_name',
    },
    teamMembers: {
      type: DataTypes.JSON, // Lưu mảng các thành viên
      allowNull: true,
      field: 'team_members',
    },
    teamSubstitutes: {
      type: DataTypes.JSON, // Lưu mảng các dự bị
      allowNull: true,
      field: 'team_substitutes',
    },
    registeredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'registered_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  },
  {
    tableName: 'registrations',
    timestamps: false,
    indexes: [
      {
        unique: true,
        name: 'unique_email_per_tournament',
        fields: ['tournament_id', 'email'],
      },
      {
        unique: true,
        name: 'unique_phone_per_tournament',
        fields: ['tournament_id', 'phone'],
      },
    ],
  }
);

Registration.belongsTo(Tournament, { as: 'tournament', foreignKey: 'tournamentId' });

module.exports = Registration;