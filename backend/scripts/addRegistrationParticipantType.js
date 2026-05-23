/**
 * One-time migration: add participant_type to registrations if missing.
 * Run: node scripts/addRegistrationParticipantType.js
 */
require('dotenv').config();
const sequelize = require('../config/db');

async function migrate() {
  try {
    await sequelize.authenticate();
    const [rows] = await sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'registrations'
        AND COLUMN_NAME = 'participant_type'
    `);

    if (rows.length > 0) {
      console.log('Column participant_type already exists.');
      return;
    }

    await sequelize.query(`
      ALTER TABLE registrations
      ADD COLUMN participant_type ENUM('person', 'team') NOT NULL DEFAULT 'person'
      AFTER user_id
    `);
    console.log('Added participant_type column to registrations.');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

migrate();