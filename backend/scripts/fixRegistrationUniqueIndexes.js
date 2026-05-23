/**
 * Fix unique constraints: email/phone unique per tournament, not globally.
 * Run: node scripts/fixRegistrationUniqueIndexes.js
 */
require('dotenv').config();
const sequelize = require('../config/db');

async function dropIndexIfExists(indexName) {
  const [rows] = await sequelize.query(`
    SELECT INDEX_NAME
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'registrations'
      AND INDEX_NAME = ?
  `, { replacements: [indexName] });

  if (rows.length > 0) {
    await sequelize.query(`ALTER TABLE registrations DROP INDEX \`${indexName}\``);
    console.log(`Dropped index ${indexName}`);
  }
}

async function addCompositeIndexIfMissing(indexName, columns) {
  const [rows] = await sequelize.query(`
    SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'registrations'
      AND INDEX_NAME = ?
    GROUP BY INDEX_NAME
  `, { replacements: [indexName] });

  const expected = columns.join(',');
  if (rows.length > 0 && rows[0].cols === expected) {
    console.log(`Index ${indexName} already correct (${expected})`);
    return;
  }

  if (rows.length > 0) {
    await sequelize.query(`ALTER TABLE registrations DROP INDEX \`${indexName}\``);
    console.log(`Dropped outdated index ${indexName}`);
  }

  const colList = columns.map((c) => `\`${c}\``).join(', ');
  await sequelize.query(`
    ALTER TABLE registrations
    ADD UNIQUE INDEX \`${indexName}\` (${colList})
  `);
  console.log(`Added composite index ${indexName} on (${expected})`);
}

async function migrate() {
  try {
    await sequelize.authenticate();
    await dropIndexIfExists('unique_email_per_tournament');
    await dropIndexIfExists('unique_phone_per_tournament');
    await addCompositeIndexIfMissing('unique_email_per_tournament', ['tournament_id', 'email']);
    await addCompositeIndexIfMissing('unique_phone_per_tournament', ['tournament_id', 'phone']);
    console.log('Migration completed.');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

migrate();
