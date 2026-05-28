const { pool } = require('../../../config/database');
const { ROLES } = require('../../shared/constants');

async function countFirst(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return Number(rows[0]?.total || 0);
}

function metric(label, value, note, tone = 'neutral') {
  return {
    label,
    value,
    note,
    tone,
  };
}

async function getAdministratorDashboard() {
  const [activeUsers, inactiveUsers, roles, activeRooms, inactiveRooms, auditRows] = await Promise.all([
    countFirst('SELECT COUNT(*) AS total FROM users WHERE is_active = 1'),
    countFirst('SELECT COUNT(*) AS total FROM users WHERE is_active = 0'),
    countFirst('SELECT COUNT(*) AS total FROM roles'),
    countFirst('SELECT COUNT(*) AS total FROM rooms WHERE is_active = 1'),
    countFirst('SELECT COUNT(*) AS total FROM rooms WHERE is_active = 0'),
    pool.execute(
      `SELECT audit_logs.action, audit_logs.entity, audit_logs.created_at, users.full_name
       FROM audit_logs
       LEFT JOIN users ON users.id = audit_logs.user_id
       ORDER BY audit_logs.created_at DESC
       LIMIT 5`
    ),
  ]);

  return {
    title: 'Dashboard Administrator',
    description: 'Ringkasan konfigurasi sistem, pengguna, ruangan, dan aktivitas terbaru.',
    metrics: [
      metric('User Aktif', activeUsers, 'Akun yang bisa login', 'success'),
      metric('User Nonaktif', inactiveUsers, 'Akun yang dinonaktifkan', inactiveUsers > 0 ? 'warning' : 'neutral'),
      metric('Role', roles, 'Role sistem tersedia'),
      metric('Ruangan Aktif', activeRooms, 'Ruangan yang bisa dipakai', 'success'),
      metric('Ruangan Nonaktif', inactiveRooms, 'Disimpan sebagai histori', inactiveRooms > 0 ? 'warning' : 'neutral'),
    ],
    sections: [
      {
        title: 'Audit Terbaru',
        emptyTitle: 'Belum ada audit log',
        emptyMessage: 'Aktivitas penting akan muncul setelah fitur digunakan.',
        items: auditRows[0].map((item) => ({
          title: `${item.action} - ${item.entity}`,
          subtitle: item.full_name || 'Sistem',
          status: 'audit',
          date: item.created_at,
        })),
      },
    ],
  };
}

async function getKepalaLaboratoriumDashboard(user) {
  const [statusRows] = await pool.execute(
    `SELECT status, COUNT(*) AS total
     FROM procurement_drafts
     WHERE created_by_user_id = ?
     GROUP BY status`,
    [user.id]
  );

  const statusMap = statusRows.reduce((acc, item) => {
    acc[item.status] = Number(item.total || 0);
    return acc;
  }, {});

  const [recentRows] = await pool.execute(
    `SELECT title, status, updated_at
     FROM procurement_drafts
     WHERE created_by_user_id = ?
     ORDER BY updated_at DESC
     LIMIT 5`,
    [user.id]
  );

  return {
    title: 'Dashboard Kepala Laboratorium',
    description: 'Ringkasan draf pengadaan yang dibuat oleh akun ini.',
    metrics: [
      metric('Draft', statusMap.draft || 0, 'Masih bisa diedit'),
      metric('Submitted', statusMap.submitted || 0, 'Menunggu review Kaprodi', 'warning'),
      metric('Finalized', statusMap.finalized || 0, 'Sudah dikunci', 'success'),
    ],
    sections: [
      {
        title: 'Draf Terbaru',
        emptyTitle: 'Belum ada draf pengadaan',
        emptyMessage: 'Draf pengadaan milik akun ini akan tampil di sini.',
        items: recentRows.map((item) => ({
          title: item.title,
          subtitle: 'Pengadaan tahunan',
          status: item.status,
          date: item.updated_at,
        })),
      },
    ],
  };
}

async function getKetuaProgramStudiDashboard() {
  const [submittedDrafts, pendingItems, recentRows] = await Promise.all([
    countFirst("SELECT COUNT(*) AS total FROM procurement_drafts WHERE status = 'submitted'"),
    countFirst("SELECT COUNT(*) AS total FROM procurement_items WHERE review_status = 'pending_review'"),
    pool.execute(
      `SELECT title, status, submitted_at
       FROM procurement_drafts
       WHERE status = 'submitted'
       ORDER BY submitted_at DESC
       LIMIT 5`
    ),
  ]);

  return {
    title: 'Dashboard Ketua Program Studi',
    description: 'Ringkasan draf dan item yang menunggu review.',
    metrics: [
      metric('Draf Submitted', submittedDrafts, 'Menunggu keputusan review', 'warning'),
      metric('Item Pending', pendingItems, 'Belum approve/reject', 'warning'),
    ],
    sections: [
      {
        title: 'Antrean Review',
        emptyTitle: 'Tidak ada antrean review',
        emptyMessage: 'Draf submitted akan tampil ketika Kepala Lab mengajukan pengadaan.',
        items: recentRows[0].map((item) => ({
          title: item.title,
          subtitle: 'Menunggu review',
          status: item.status,
          date: item.submitted_at,
        })),
      },
    ],
  };
}

async function getStafAdministrasiDashboard() {
  const [approvedItems, partiallyReceived, fullyReceived] = await Promise.all([
    countFirst(
      `SELECT COUNT(*) AS total
       FROM procurement_items
       INNER JOIN procurement_drafts ON procurement_drafts.id = procurement_items.draft_id
       WHERE procurement_drafts.status = 'finalized'
         AND procurement_items.review_status = 'approved'
         AND procurement_items.receiving_status IN ('not_received', 'partially_received')`
    ),
    countFirst("SELECT COUNT(*) AS total FROM procurement_items WHERE receiving_status = 'partially_received'"),
    countFirst("SELECT COUNT(*) AS total FROM procurement_items WHERE receiving_status = 'fully_received'"),
  ]);

  const [recentRows] = await pool.execute(
    `SELECT procurement_items.name, procurement_items.receiving_status, procurement_items.updated_at
     FROM procurement_items
     INNER JOIN procurement_drafts ON procurement_drafts.id = procurement_items.draft_id
     WHERE procurement_drafts.status = 'finalized'
       AND procurement_items.review_status = 'approved'
     ORDER BY procurement_items.updated_at DESC
     LIMIT 5`
  );

  return {
    title: 'Dashboard Staf Administrasi',
    description: 'Ringkasan item approved yang masuk proses penerimaan.',
    metrics: [
      metric('Siap Diterima', approvedItems, 'Approved dan finalized', 'warning'),
      metric('Partial', partiallyReceived, 'Sudah diterima sebagian'),
      metric('Selesai Diterima', fullyReceived, 'Receiving lengkap', 'success'),
    ],
    sections: [
      {
        title: 'Item Penerimaan Terbaru',
        emptyTitle: 'Belum ada item penerimaan',
        emptyMessage: 'Item approved dari draf finalized akan tampil di sini.',
        items: recentRows.map((item) => ({
          title: item.name,
          subtitle: 'Penerimaan barang',
          status: item.receiving_status,
          date: item.updated_at,
        })),
      },
    ],
  };
}

async function getStafLaboratoriumDashboard() {
  const [lowStock, damagedAssets, maintenanceAssets, recentRows] = await Promise.all([
    countFirst('SELECT COUNT(*) AS total FROM consumables WHERE current_stock <= minimum_stock'),
    countFirst("SELECT COUNT(*) AS total FROM assets WHERE status = 'damaged'"),
    countFirst("SELECT COUNT(*) AS total FROM assets WHERE status = 'maintenance'"),
    pool.execute(
      `SELECT maintenance_logs.description, maintenance_logs.maintenance_date, assets.name AS asset_name
       FROM maintenance_logs
       INNER JOIN assets ON assets.id = maintenance_logs.asset_id
       ORDER BY maintenance_logs.maintenance_date DESC, maintenance_logs.id DESC
       LIMIT 5`
    ),
  ]);

  return {
    title: 'Dashboard Staf Laboratorium',
    description: 'Ringkasan stok BHP, kondisi aset, dan aktivitas maintenance.',
    metrics: [
      metric('BHP Low Stock', lowStock, 'Stok di bawah minimum', lowStock > 0 ? 'warning' : 'success'),
      metric('Aset Rusak', damagedAssets, 'Butuh tindak lanjut', damagedAssets > 0 ? 'danger' : 'success'),
      metric('Maintenance', maintenanceAssets, 'Sedang perawatan', maintenanceAssets > 0 ? 'warning' : 'neutral'),
    ],
    sections: [
      {
        title: 'Maintenance Terbaru',
        emptyTitle: 'Belum ada maintenance',
        emptyMessage: 'Riwayat maintenance aset akan tampil di sini.',
        items: recentRows[0].map((item) => ({
          title: item.asset_name,
          subtitle: item.description,
          status: 'maintenance',
          date: item.maintenance_date,
        })),
      },
    ],
  };
}

async function getDashboardData(user) {
  switch (user.roleName) {
    case ROLES.ADMINISTRATOR:
      return getAdministratorDashboard();
    case ROLES.KEPALA_LABORATORIUM:
      return getKepalaLaboratoriumDashboard(user);
    case ROLES.KETUA_PROGRAM_STUDI:
      return getKetuaProgramStudiDashboard();
    case ROLES.STAF_ADMINISTRASI:
      return getStafAdministrasiDashboard();
    case ROLES.STAF_LABORATORIUM:
      return getStafLaboratoriumDashboard();
    default:
      return {
        title: 'Dashboard',
        description: 'Role belum memiliki konfigurasi dashboard.',
        metrics: [],
        sections: [],
      };
  }
}

module.exports = {
  getDashboardData,
};
