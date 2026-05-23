const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Tournament = require('./Tournament');

const TournamentContact = sequelize.define(
  'TournamentContact',
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
    platform: {
      type: DataTypes.ENUM('facebook', 'discord', 'gmail', 'zalo'),
      allowNull: false,
    },
    contact: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
  },
  {
    tableName: 'tournament_contacts',
    timestamps: true,
  }
);

TournamentContact.belongsTo(Tournament, { as: 'tournament', foreignKey: 'tournamentId' });

module.exports = TournamentContact;