const Game = require('../models/Game');
const path = require('path');
const fs = require('fs');

const gameController = {
  // GET /api/games
  async getAllGames(req, res) {
    try {
      const games = await Game.findAll({
        where: { isActive: true },
        attributes: ['id', 'name', 'slug', 'icon', 'description', 'imageUrl', 'backgroundImage', 'rating', 'players', 'releaseDate'],
      });
      res.json(games);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch games.', error: error.message });
    }
  },

  // GET /api/games/:id
  async getGameById(req, res) {
    try {
      const { id } = req.params;
      
      const game = await Game.findByPk(id);
      if (!game) {
        return res.status(404).json({ message: 'Game not found.' });
      }
      
      res.json(game);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch game.', error: error.message });
    }
  },

  // POST /api/games
  async createGame(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required.' });
      }
      
      const { name, slug, icon, description, imageUrl, backgroundImage, rating, players, releaseDate, developer, publisher, platforms, genre } = req.body;
      
      if (!name || !slug) {
        return res.status(400).json({ message: 'Name and slug are required.' });
      }
      
      const existingGame = await Game.findOne({ where: { slug } });
      if (existingGame) {
        return res.status(409).json({ message: 'Game with this slug already exists.' });
      }
      
      const game = await Game.create({
        name,
        slug,
        icon: icon || '🎮',
        description,
        imageUrl,
        backgroundImage,
        rating,
        players,
        releaseDate,
        developer,
        publisher,
        platforms,
        genre,
        isActive: true,
      });
      
      res.status(201).json({
        message: 'Game created successfully.',
        game,
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to create game.', error: error.message });
    }
  },

  // PUT /api/games/:id
  async updateGame(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required.' });
      }
      
      const { id } = req.params;
      const { name, slug, icon, description, imageUrl, backgroundImage, rating, players, releaseDate, developer, publisher, platforms, genre, isActive } = req.body;
      
      const game = await Game.findByPk(id);
      if (!game) {
        return res.status(404).json({ message: 'Game not found.' });
      }
      
      await game.update({
        name: name || game.name,
        slug: slug || game.slug,
        icon: icon || game.icon,
        description: description !== undefined ? description : game.description,
        imageUrl: imageUrl !== undefined ? imageUrl : game.imageUrl,
        backgroundImage: backgroundImage !== undefined ? backgroundImage : game.backgroundImage,
        rating: rating !== undefined ? rating : game.rating,
        players: players !== undefined ? players : game.players,
        releaseDate: releaseDate !== undefined ? releaseDate : game.releaseDate,
        developer: developer !== undefined ? developer : game.developer,
        publisher: publisher !== undefined ? publisher : game.publisher,
        platforms: platforms !== undefined ? platforms : game.platforms,
        genre: genre !== undefined ? genre : game.genre,
        isActive: isActive !== undefined ? isActive : game.isActive,
      });
      
      res.json({ message: 'Game updated successfully.', game });
    } catch (error) {
      res.status(500).json({ message: 'Failed to update game.', error: error.message });
    }
  },

  // DELETE /api/games/:id
  async deleteGame(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required.' });
      }
      
      const { id } = req.params;
      
      const game = await Game.findByPk(id);
      if (!game) {
        return res.status(404).json({ message: 'Game not found.' });
      }
      
      if (game.imageUrl) {
        const imagePath = path.join(__dirname, '../../frontend/public', game.imageUrl);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      
      if (game.backgroundImage) {
        const bgPath = path.join(__dirname, '../../frontend/public', game.backgroundImage);
        if (fs.existsSync(bgPath)) {
          fs.unlinkSync(bgPath);
        }
      }
      
      await game.destroy();
      res.json({ message: 'Game deleted successfully.' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete game.', error: error.message });
    }
  },
};

module.exports = gameController;