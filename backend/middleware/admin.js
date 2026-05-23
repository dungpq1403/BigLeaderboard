const adminMiddleware = async (req, res, next) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required.' });
      }
      next();
    } catch (error) {
      return res.status(500).json({ message: 'Authorization error.' });
    }
  };
  
  module.exports = adminMiddleware;