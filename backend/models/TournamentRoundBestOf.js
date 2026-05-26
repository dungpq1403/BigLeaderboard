const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Tournament = require('./Tournament');

const TournamentRoundBestOf = sequelize.define(
  'TournamentRoundBestOf',
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
    roundNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'round_number',
    },
    formatType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'format_type',
    },
    bestOf: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
      field: 'best_of',
    },
  },
  {
    tableName: 'tournament_round_best_of',
    timestamps: true,
  }
);

TournamentRoundBestOf.belongsTo(Tournament, { as: 'tournament', foreignKey: 'tournamentId' });

module.exports = TournamentRoundBestOf;