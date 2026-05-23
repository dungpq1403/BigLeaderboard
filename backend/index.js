// backend/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const sequelize = require('./config/db');      // nếu dùng Sequelize
const apiRoutes = require('./routes/api');
const enka = require('./routes/enka');
const imageUpload = require('./routes/imageUpload');
const initAdmin = require('./scripts/initAdmin');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());        // parse JSON body
app.use(morgan('dev'));         // log request

// Routes
app.use('/api', apiRoutes);
app.use('/api', enka);
app.use('/api', imageUpload);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Backend is running' });
});

// Kết nối database và start server
const startServer = async () => {
  try {
    // Nếu dùng Sequelize
    await sequelize.authenticate();
    console.log('✅ MySQL connected via Sequelize');

    await initAdmin();
    
    // Sync models - creates table if it does not exist.
    await sequelize.sync();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Unable to connect to database:', error);
    process.exit(1);
  }
};

startServer();