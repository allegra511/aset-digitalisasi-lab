require('dotenv').config({ quiet: true });

const bcrypt = require('bcrypt');
const { pool } = require('../../config/database');

const roles = [
  {
    name: 'administrator',
    label: 'Administrator',
    description: 'Mengelola pengguna, role, ruangan, laporan, dan audit sistem.',
  },
  {
    name: 'kepala_laboratorium',
    label: 'Kepala Laboratorium',
    description: 'Membuat dan mengajukan draf pengadaan tahunan.',
  },
  {
    name: 'ketua_program_studi',
    label: 'Ketua Program Studi',
    description: 'Mereview, menyetujui, menolak, dan memfinalisasi pengadaan.',
  },
  {
    name: 'staf_administrasi',
    label: 'Staf Administrasi',
    description: 'Mencatat penerimaan barang, nomor inventaris, dan data awal aset atau BHP.',
  },
  {
    name: 'staf_laboratorium',
    label: 'Staf Laboratorium',
    description: 'Mengelola kondisi aset, maintenance, dan stok BHP.',
  },
];

const demoUsers = [
  {
    roleName: 'kepala_laboratorium',
    fullName: 'Kepala Laboratorium',
    email: 'kepalalab@example.test',
    username: 'kepalalab',
    password: 'demo12345',
  },
  {
    roleName: 'ketua_program_studi',
    fullName: 'Ketua Program Studi',
    email: 'kaprodi@example.test',
    username: 'kaprodi',
    password: 'demo12345',
  },
  {
    roleName: 'staf_administrasi',
    fullName: 'Staf Administrasi',
    email: 'stafadmin@example.test',
    username: 'stafadmin',
    password: 'demo12345',
  },
  {
    roleName: 'staf_laboratorium',
    fullName: 'Staf Laboratorium',
    email: 'staflab@example.test',
    username: 'staf_lab',
    password: 'demo12345',
  },
];

async function seed() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const role of roles) {
      await connection.execute(
        `INSERT INTO roles (name, label, description)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description)`,
        [role.name, role.label, role.description]
      );
    }

    const [[administratorRole]] = await connection.execute(
      'SELECT id FROM roles WHERE name = ? LIMIT 1',
      ['administrator']
    );

    if (!administratorRole) {
      throw new Error('Role administrator tidak ditemukan setelah proses seeding.');
    }

    const adminName = process.env.DEFAULT_ADMIN_NAME || 'Administrator';
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.test';
    const adminUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin12345';
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    await connection.execute(
      `INSERT INTO users (role_id, full_name, email, username, password_hash, is_active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         role_id = VALUES(role_id),
         full_name = VALUES(full_name),
         username = VALUES(username),
         is_active = 1`,
      [administratorRole.id, adminName, adminEmail, adminUsername, passwordHash]
    );

    await connection.execute('DELETE FROM users WHERE username = ?', ['staflab']);

    for (const user of demoUsers) {
      const [[role]] = await connection.execute('SELECT id FROM roles WHERE name = ? LIMIT 1', [user.roleName]);

      if (!role) {
        throw new Error(`Role ${user.roleName} tidak ditemukan setelah proses seeding.`);
      }

      const demoPasswordHash = await bcrypt.hash(user.password, 12);

      await connection.execute(
        `INSERT INTO users (role_id, full_name, email, username, password_hash, is_active)
         VALUES (?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           role_id = VALUES(role_id),
           full_name = VALUES(full_name),
           username = VALUES(username),
           password_hash = VALUES(password_hash),
           is_active = 1`,
        [role.id, user.fullName, user.email, user.username, demoPasswordHash]
      );
    }

    await connection.commit();
    console.log('Seeder roles, admin default, dan user demo berhasil dijalankan.');
    console.log(`Admin email: ${adminEmail}`);
    console.log(`Admin username: ${adminUsername}`);
    console.log('Password user demo non-admin: demo12345');
  } catch (error) {
    await connection.rollback();
    console.error('Seeder gagal:', error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

seed();
