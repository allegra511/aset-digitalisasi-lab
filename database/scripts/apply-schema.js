require('dotenv').config({ quiet: true });

const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const { databaseConfig } = require('../../config/database');

async function applySchema() {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  const connection = await mysql.createConnection({
    ...databaseConfig,
    multipleStatements: true,
  });

  try {
    await connection.query(schemaSql);
    console.log('Schema database berhasil dijalankan.');
  } finally {
    await connection.end();
  }
}

applySchema().catch((error) => {
  console.error('Gagal menjalankan schema:', error.message);
  process.exitCode = 1;
});
