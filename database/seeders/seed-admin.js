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

    // ============================================================================
    // EXTRA DATA ADDITIONS FOR DEBUGGING ALL REMAINING TABLES
    // ============================================================================

    // Gather dynamic user IDs to maintain true relational consistency
    const [[adminUser]] = await connection.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [adminUsername]);
    const [[kepalaLab]] = await connection.execute('SELECT id FROM users WHERE username = ? LIMIT 1', ['kepalalab']);
    const [[stafLab]] = await connection.execute('SELECT id FROM users WHERE username = ? LIMIT 1', ['staf_lab']);

    // 1. ROOMS
    await connection.execute(
      `INSERT INTO rooms (id, code, name, location, description, is_active) VALUES
       (1, 'LAB-COMP-01', 'Laboratorium Komputer Utama', 'Gedung A, Lantai 2', 'Lab pemrograman dasar dan riset.', 1),
       (2, 'LAB-OLD-05', 'Laboratorium Usang', 'Gedung C, Lantai 3', 'Ruangan non-aktif sementara.', 0)
       ON DUPLICATE KEY UPDATE code=VALUES(code), name=VALUES(name), is_active=VALUES(is_active)`
    );

    // 2. PROCUREMENT DRAFTS
    await connection.execute(
      `INSERT INTO procurement_drafts (id, year, title, status, is_locked, created_by_user_id, submitted_at, finalized_by_user_id, finalized_at, notes) VALUES
       (1, 2026, 'Pengadaan PC High-End Jurusan Informatika', 'approved', 1, ?, '2026-01-15 08:30:00', ?, '2026-01-20 14:00:00', 'Disetujui untuk peningkatan fasilitas render grafis.')
       ON DUPLICATE KEY UPDATE title=VALUES(title), status=VALUES(status), is_locked=VALUES(is_locked)`,
      [kepalaLab.id, adminUser.id]
    );

    // 3. PROCUREMENT ITEMS
    await connection.execute(
      `INSERT INTO procurement_items (id, draft_id, item_type, name, specification, quantity_requested, quantity_approved, estimated_unit_price, final_unit_price, room_id, reference_link, notes, review_status, receiving_status) VALUES
       (1, 1, 'asset', 'Workstation ASUS ROG Strix', 'AMD Ryzen 9, 64GB RAM, RTX 4090', 2, 2, 45000000.00, 44500000.00, 1, 'https://asus.com', 'Prioritas lab riset.', 'approved', 'received'),
       (2, 1, 'consumable', 'Thermal Paste Arctic MX-6', 'High-performance thermal compound 4g', 10, 10, 150000.00, 140000.00, 1, NULL, 'Stok perawatan berkala.', 'approved', 'received')
       ON DUPLICATE KEY UPDATE name=VALUES(name), review_status=VALUES(review_status), receiving_status=VALUES(receiving_status)`
    );

    // 4. RECEIVING RECORDS
    await connection.execute(
      `INSERT INTO receiving_records (id, procurement_item_id, received_quantity, received_date, receiver_user_id, supplier_name, purchase_reference, note) VALUES
       (1, 1, 2, '2026-02-10', ?, 'PT. Komputer Maju Jaya', 'PO-2026-0011A', 'Lolos uji stress test.'),
       (2, 2, 10, '2026-02-10', ?, 'PT. Komputer Maju Jaya', 'PO-2026-0011A', 'Kemasan suntikan utuh.')
       ON DUPLICATE KEY UPDATE received_quantity=VALUES(received_quantity), supplier_name=VALUES(supplier_name)`,
      [stafLab.id, stafLab.id]
    );

    // 5. ASSETS
    await connection.execute(
      `INSERT INTO assets (id, procurement_item_id, receiving_record_id, room_id, inventory_number, name, specification, status, asset_condition, acquisition_date, qr_code_path, created_by_user_id) VALUES
       (1, 1, 1, 1, 'INV/2026/LAB-COMP/WS-01', 'Workstation ASUS ROG Strix - Unit 1', 'AMD Ryzen 9, 64GB RAM, RTX 4090', 'active', 'good', '2026-02-10', '/uploads/qrcodes/qr-INV-2026-LAB-COMP-WS-01.png', ?),
       (2, NULL, NULL, 2, 'INV/2022/LAB-COMP/PRJ-OLD', 'Projector BenQ Lama', 'SVGA Legacy Projector', 'replaced', 'broken', '2022-04-18', '/uploads/qrcodes/qr-OLD-PRJ.png', ?)
       ON DUPLICATE KEY UPDATE inventory_number=VALUES(inventory_number), status=VALUES(status), asset_condition=VALUES(asset_condition)`,
      [stafLab.id, stafLab.id]
    );

    // Update dependency reference path in dynamic items listing
    await connection.execute('UPDATE procurement_items SET replacement_candidate_asset_id = 2 WHERE id = 1');

    // 6. ASSET STATUS HISTORIES
    await connection.execute(
      `INSERT INTO asset_status_histories (id, asset_id, previous_status, new_status, previous_condition, new_condition, changed_by_user_id, note) VALUES
       (1, 1, NULL, 'active', NULL, 'good', ?, 'Inisialisasi record aset dari penerimaan barang.'),
       (2, 2, 'active', 'replaced', 'damaged', 'broken', ?, 'Digantikan penuh oleh unit baru karena lampu merkuri mati total.')
       ON DUPLICATE KEY UPDATE note=VALUES(note)`,
      [stafLab.id, stafLab.id]
    );

    // 7. ASSET REPLACEMENTS
    await connection.execute(
      `INSERT INTO asset_replacements (id, old_asset_id, new_asset_id, reason, replacement_date, created_by_user_id) VALUES
       (1, 2, 1, 'Unit proyektor lama mengalami degradasi hardware permanen.', '2026-02-12', ?)
       ON DUPLICATE KEY UPDATE reason=VALUES(reason)`,
      [stafLab.id]
    );

    // 8. CONSUMABLES
    await connection.execute(
      `INSERT INTO consumables (id, procurement_item_id, room_id, name, specification, unit, current_stock, minimum_stock, status, created_by_user_id) VALUES
       (1, 2, 1, 'Thermal Paste Arctic MX-6', 'High-performance thermal compound 4g', 'tube', 8, 3, 'available', ?),
       (2, NULL, 1, 'Alkohol Swab 70%', 'Sterile Isopropyl Alcohol Prep Pad', 'box', 1, 5, 'low_stock', ?)
       ON DUPLICATE KEY UPDATE current_stock=VALUES(current_stock), status=VALUES(status)`,
      [stafLab.id, stafLab.id]
    );

    // 9. CONSUMABLE STOCK TRANSACTIONS
    await connection.execute(
      `INSERT INTO consumable_stock_transactions (id, consumable_id, transaction_type, quantity, stock_before, stock_after, source_type, source_id, note, created_by_user_id) VALUES
       (1, 1, 'restock', 10, 0, 10, 'receiving_records', 2, 'Pasokan awal dari hasil pengadaan.', ?),
       (2, 1, 'usage', 2, 10, 8, 'maintenance_logs', 1, 'Digunakan untuk repasting CPU workstation.', ?)
       ON DUPLICATE KEY UPDATE quantity=VALUES(quantity), stock_after=VALUES(stock_after)`,
      [stafLab.id, stafLab.id]
    );

    // 10. MAINTENANCE LOGS
    await connection.execute(
      `INSERT INTO maintenance_logs (id, asset_id, maintenance_date, description, condition_before, condition_after, status_after, cost, performed_by_user_id) VALUES
       (1, 1, '2026-03-01', 'Pembersihan debu eksternal dan repasting processor.', 'good', 'good', 'active', 0.00, ?)
       ON DUPLICATE KEY UPDATE description=VALUES(description), cost=VALUES(cost)`,
      [stafLab.id]
    );

    // 11. MAINTENANCE CONSUMABLES
    await connection.execute(
      `INSERT INTO maintenance_consumables (id, maintenance_log_id, consumable_id, quantity_used) VALUES
       (1, 1, 1, 2)
       ON DUPLICATE KEY UPDATE quantity_used=VALUES(quantity_used)`
    );

    // 12. ATTACHMENTS
    await connection.execute(
      `INSERT INTO attachments (id, entity_type, entity_id, file_name, original_name, mime_type, file_size, file_path, uploaded_by_user_id) VALUES
       (1, 'assets', 1, 'invoice-rog.pdf', 'Kwitansi_Pembelian.pdf', 'application/pdf', 1048576, '/uploads/attachments/invoice-rog.pdf', ?)
       ON DUPLICATE KEY UPDATE file_name=VALUES(file_name)`,
      [stafLab.id]
    );

    // 13. AUDIT LOGS
    await connection.execute(
      `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, before_data, after_data, ip_address, user_agent) VALUES
       (1, ?, 'APPROVE_PROCUREMENT', 'procurement_drafts', 1, '{"status": "draft"}', '{"status": "approved"}', '192.168.1.50', 'Mozilla/5.0')
       ON DUPLICATE KEY UPDATE action=VALUES(action)`,
      [adminUser.id]
    );

    await connection.commit();
    console.log('Seeder roles, admin default, dan user demo berhasil dijalankan.');
    console.log(`Admin email: ${adminEmail}`);
    console.log(`Admin username: ${adminUsername}`);
    console.log('Password user demo non-admin: demo12345');
    console.log('Semua tabel tambahan (Aset, Ruangan, Perbaikan, Log, dsb) sukses dimuat untuk kebutuhan debug.');
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