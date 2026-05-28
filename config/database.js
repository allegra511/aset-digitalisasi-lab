const mysql = require('mysql2/promise');

const databaseConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'aset_digitalisasi_lab',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  timezone: 'Z',
  charset: 'utf8mb4',
};

const pool = mysql.createPool(databaseConfig);

module.exports = {
  pool,
  databaseConfig,
};
