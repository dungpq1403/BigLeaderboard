const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Game = sequelize.define(
  'Game',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    icon: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: '🎮',
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
    backgroundImage: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'background_image',
    },
    rating: {
      type: DataTypes.DECIMAL(3, 1),
      allowNull: true,
    },
    players: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    releaseDate: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'release_date',
    },
    developer: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    publisher: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    platforms: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    genre: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
  },
  {
    tableName: 'games',
    timestamps: true,
  }
);

module.exports = Game;