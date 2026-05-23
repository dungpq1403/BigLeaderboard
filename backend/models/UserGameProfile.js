const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./User');
const Game = require('./Game');

const UserGameProfile = sequelize.define(
  'UserGameProfile',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'user_id',
    },
    gameId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'game_id',
    },
    uid: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    profileData: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'profile_data',
    },
    lastSynced: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_synced',
    },
  },
  {
    tableName: 'user_game_profiles',
    timestamps: true,
  }
);

UserGameProfile.belongsTo(User, { as: 'user', foreignKey: 'userId' });
UserGameProfile.belongsTo(Game, { as: 'game', foreignKey: 'gameId' });

module.exports = UserGameProfile;