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
const addUserRestrictedUntilColumn = require('./scripts/addUserRestrictedUntil');
const { encodeResponseIds, decodeBodyIds } = require('./middleware/idHash');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());        // parse JSON body
app.use(morgan('dev'));         // log request

// Encode mọi field id trong response JSON dưới /api thành hash trước khi gửi
// về client. Đặt TRƯỚC các router để wrap res.json trên mọi handler con.
// Decode hash → số được gắn trong từng router file qua attachIdParamDecoders
// vì router.param chỉ hoạt động ở phạm vi router.
app.use('/api', encodeResponseIds);

// Decode hash trong request body (vd: POST /tournaments với gameId hash).
// Phải đặt SAU express.json() để có req.body đã parse, và TRƯỚC các router.
app.use('/api', decodeBodyIds);

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

    // Sequelize.sync() (không có alter:true) không thêm cột mới cho bảng đã
    // tồn tại → cần migration thủ công cho các trường thêm sau. Idempotent
    // nên gọi mọi lần startup không gây tác dụng phụ.
    await addUserRestrictedUntilColumn();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Unable to connect to database:', error);
    process.exit(1);
  }
};

startServer();