const path = require('path');
const fs = require('fs');

const uploadController = {
  // POST /api/upload/tournament-image
  async uploadTournamentImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      const imageUrl = `/uploads/tournaments/${req.file.filename}`;
      res.json({ imageUrl });
    } catch (error) {
      res.status(500).json({ message: 'Upload failed', error: error.message });
    }
  },

  // POST /api/upload/game-image
  async uploadGameImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      const imageUrl = `/uploads/games/${req.file.filename}`;
      res.json({ imageUrl });
    } catch (error) {
      res.status(500).json({ message: 'Upload failed', error: error.message });
    }
  },

  // POST /api/upload/game-background
  async uploadGameBackground(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      const imageUrl = `/uploads/games/backgrounds/${req.file.filename}`;
      res.json({ imageUrl });
    } catch (error) {
      res.status(500).json({ message: 'Upload failed', error: error.message });
    }
  },

  // DELETE /api/upload/delete-image
  async deleteImage(req, res) {
    try {
      const { imageUrl } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ message: 'Image URL is required.' });
      }
      
      // Xác định đường dẫn tuyệt đối đến file ảnh
      // imageUrl có dạng: /uploads/tournaments/xxx.jpg hoặc /uploads/games/xxx.jpg
      const imagePath = path.join(__dirname, '../../frontend/public', imageUrl);
      
      // Kiểm tra file tồn tại
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log('Deleted image:', imagePath);
        res.json({ message: 'Image deleted successfully.' });
      } else {
        res.status(404).json({ message: 'Image file not found.' });
      }
    } catch (error) {
      console.error('Delete image error:', error);
      res.status(500).json({ message: 'Failed to delete image.', error: error.message });
    }
  }
};

module.exports = uploadController;