const bcrypt = require('bcrypt');
const User = require('../models/User');

const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_USERNAME = 'admin';
const ADMIN_FULLNAME = 'Administrator';
const BCRYPT_ROUNDS = 12;

async function initAdmin() {
  try {
    const existingAdmin = await User.findOne({ where: { email: ADMIN_EMAIL } });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);

      await User.create({
        username: ADMIN_USERNAME,
        email: ADMIN_EMAIL,
        password: hashedPassword,
        fullName: ADMIN_FULLNAME,
        birthDate: '2000-01-01',
        description: 'System Administrator',
        country: 'Vietnam',
        role: 'admin',
      });

      console.log('Admin user created successfully');
      return;
    }

    if (existingAdmin.role !== 'admin') {
      existingAdmin.role = 'admin';
      await existingAdmin.save();
      console.log('Admin user role updated');
    } else {
      console.log('Admin user already exists');
    }
  } catch (error) {
    console.error('Failed to init admin:', error);
  }
}

module.exports = initAdmin;
