const { pool } = require('../../../config/database');
const { limitOffsetClause } = require('../../shared/helpers/sql');

const REPORT_TYPES = {
  ASSETS: 'assets',
  CONSUMABLES: 'consumables',
  CONSUMABLE_USAGE: 'consumable-usage',
  MAINTENANCE: 'maintenance',
  PROCUREMENT: 'procurement',
  RECEIVING: 'receiving',
};

const REPORT_DEFINITIONS = {
  [REPORT_TYPES.ASSETS]: {
    title: 'Laporan Inventaris',
    description: 'Daftar aset, kondisi, ruangan, dan status termasuk deleted/replaced.',
    emptyTitle: 'Belum ada data inventaris',
    emptyMessage: 'Data aset akan tampil sesuai filter laporan.',
    filters: ['search', 'roomId', 'status', 'condition', 'dateFrom', 'dateTo'],
    columns: [
      { key: 'inventory_number', label: 'Nomor Inventaris' },
      { key: 'name', label: 'Nama Aset' },
      { key: 'room_label', label: 'Ruangan' },
      { key: 'status', label: 'Status', type: 'badge' },
      { key: 'asset_condition', label: 'Kondisi', type: 'badge' },
      { key: 'acquisition_date', label: 'Tanggal Perolehan', type: 'date' },
    ],
  },
  [REPORT_TYPES.CONSUMABLES]: {
    title: 'Laporan Stok BHP',
    description: 'Ringkasan stok, satuan, status, dan stok minimum BHP.',
    emptyTitle: 'Belum ada data BHP',
    emptyMessage: 'Data BHP akan tampil sesuai filter laporan.',
    filters: ['search', 'roomId', 'status'],
    columns: [
      { key: 'name', label: 'Nama BHP' },
      { key: 'room_label', label: 'Ruangan' },
      { key: 'unit', label: 'Satuan' },
      { key: 'current_stock', label: 'Stok Saat Ini', type: 'number' },
      { key: 'minimum_stock', label: 'Stok Minimum', type: 'number' },
      { key: 'status', label: 'Status', type: 'badge' },
    ],
  },
  [REPORT_TYPES.CONSUMABLE_USAGE]: {
    title: 'Laporan Penggunaan BHP',
    description: 'Riwayat transaksi OUT BHP, termasuk penggunaan dari maintenance.',
    emptyTitle: 'Belum ada penggunaan BHP',
    emptyMessage: 'Transaksi OUT BHP akan tampil sesuai filter laporan.',
    filters: ['search', 'roomId', 'dateFrom', 'dateTo'],
    columns: [
      { key: 'transaction_date', label: 'Tanggal', type: 'datetime' },
      { key: 'consumable_name', label: 'Nama BHP' },
      { key: 'room_label', label: 'Ruangan' },
      { key: 'quantity', label: 'Jumlah', type: 'number' },
      { key: 'stock_before', label: 'Stok Awal', type: 'number' },
      { key: 'stock_after', label: 'Stok Akhir', type: 'number' },
      { key: 'source_type', label: 'Sumber' },
      { key: 'created_by_name', label: 'Dicatat Oleh' },
    ],
  },
  [REPORT_TYPES.MAINTENANCE]: {
    title: 'Laporan Maintenance',
    description: 'Riwayat maintenance aset, status akhir, kondisi akhir, dan biaya.',
    emptyTitle: 'Belum ada maintenance',
    emptyMessage: 'Maintenance akan tampil setelah dicatat oleh staf laboratorium.',
    filters: ['search', 'roomId', 'status', 'condition', 'dateFrom', 'dateTo'],
    columns: [
      { key: 'maintenance_date', label: 'Tanggal', type: 'date' },
      { key: 'inventory_number', label: 'Nomor Inventaris' },
      { key: 'asset_name', label: 'Aset' },
      { key: 'room_label', label: 'Ruangan' },
      { key: 'status_after', label: 'Status Akhir', type: 'badge' },
      { key: 'condition_after', label: 'Kondisi Akhir', type: 'badge' },
      { key: 'cost', label: 'Biaya', type: 'currency' },
      { key: 'performed_by_name', label: 'Dilakukan Oleh' },
    ],
  },
  [REPORT_TYPES.PROCUREMENT]: {
    title: 'Laporan Pengadaan Tahunan',
    description: 'Daftar item pengadaan berdasarkan tahun, status draf, status review, dan jenis item.',
    emptyTitle: 'Belum ada data pengadaan',
    emptyMessage: 'Data pengadaan akan tampil sesuai filter laporan.',
    filters: ['search', 'year', 'status', 'itemType', 'dateFrom', 'dateTo'],
    columns: [
      { key: 'year', label: 'Tahun' },
      { key: 'draft_title', label: 'Draf' },
      { key: 'draft_status', label: 'Status Draf', type: 'badge' },
      { key: 'item_name', label: 'Item' },
      { key: 'item_type', label: 'Jenis' },
      { key: 'review_status', label: 'Status Review', type: 'badge' },
      { key: 'quantity_requested', label: 'Qty Diminta', type: 'number' },
      { key: 'quantity_approved', label: 'Qty Disetujui', type: 'number' },
      { key: 'estimated_total', label: 'Estimasi Total', type: 'currency' },
      { key: 'creator_name', label: 'Pengaju' },
    ],
  },
  [REPORT_TYPES.RECEIVING]: {
    title: 'Laporan Penerimaan Barang',
    description: 'Batch penerimaan barang berdasarkan tanggal, item, supplier, dan penerima.',
    emptyTitle: 'Belum ada penerimaan',
    emptyMessage: 'Data penerimaan akan tampil setelah barang diterima.',
    filters: ['search', 'roomId', 'itemType', 'dateFrom', 'dateTo'],
    columns: [
      { key: 'received_date', label: 'Tanggal', type: 'date' },
      { key: 'item_name', label: 'Item' },
      { key: 'item_type', label: 'Jenis' },
      { key: 'room_label', label: 'Ruangan' },
      { key: 'received_quantity', label: 'Jumlah Diterima', type: 'number' },
      { key: 'supplier_name', label: 'Supplier' },
      { key: 'purchase_reference', label: 'Referensi' },
      { key: 'receiver_name', label: 'Penerima' },
    ],
  },
};

function getReportDefinition(reportType) {
  return REPORT_DEFINITIONS[reportType] || null;
}

function listReportTypes() {
  return Object.entries(REPORT_DEFINITIONS).map(([type, definition]) => ({
    type,
    ...definition,
  }));
}

function addDateFilter(where, params, column, filters) {
  if (filters.dateFrom) {
    where.push(`${column} >= ?`);
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    where.push(`${column} <= ?`);
    params.push(filters.dateTo);
  }
}

function withWhere(baseSql, where) {
  return where.length ? `${baseSql} WHERE ${where.join(' AND ')}` : baseSql;
}

function buildAssetsQuery(filters = {}) {
  const where = [];
  const params = [];

  if (filters.search) {
    where.push('(assets.inventory_number LIKE ? OR assets.name LIKE ? OR assets.specification LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  if (filters.roomId) {
    where.push('assets.room_id = ?');
    params.push(filters.roomId);
  }

  if (filters.status) {
    where.push('assets.status = ?');
    params.push(filters.status);
  }

  if (filters.condition) {
    where.push('assets.asset_condition = ?');
    params.push(filters.condition);
  }

  addDateFilter(where, params, 'assets.acquisition_date', filters);

  const sql = withWhere(
    `SELECT assets.id, assets.inventory_number, assets.name, assets.status, assets.asset_condition,
            assets.acquisition_date, assets.updated_at,
            CONCAT(COALESCE(rooms.code, '-'), ' - ', COALESCE(rooms.name, 'Tanpa ruangan')) AS room_label
     FROM assets
     LEFT JOIN rooms ON rooms.id = assets.room_id`,
    where
  );

  return { sql, params, orderBy: 'ORDER BY assets.updated_at DESC, assets.id DESC' };
}

function buildConsumablesQuery(filters = {}) {
  const where = [];
  const params = [];

  if (filters.search) {
    where.push('(consumables.name LIKE ? OR consumables.specification LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  if (filters.roomId) {
    where.push('consumables.room_id = ?');
    params.push(filters.roomId);
  }

  if (filters.status) {
    where.push('consumables.status = ?');
    params.push(filters.status);
  }

  const sql = withWhere(
    `SELECT consumables.id, consumables.name, consumables.unit, consumables.current_stock,
            consumables.minimum_stock, consumables.status, consumables.updated_at,
            CONCAT(COALESCE(rooms.code, '-'), ' - ', COALESCE(rooms.name, 'Tanpa ruangan')) AS room_label
     FROM consumables
     LEFT JOIN rooms ON rooms.id = consumables.room_id`,
    where
  );

  return { sql, params, orderBy: 'ORDER BY consumables.updated_at DESC, consumables.id DESC' };
}

function buildConsumableUsageQuery(filters = {}) {
  const where = ['consumable_stock_transactions.transaction_type = ?'];
  const params = ['OUT'];

  if (filters.search) {
    where.push('(consumables.name LIKE ? OR consumable_stock_transactions.note LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  if (filters.roomId) {
    where.push('consumables.room_id = ?');
    params.push(filters.roomId);
  }

  addDateFilter(where, params, 'DATE(consumable_stock_transactions.transaction_date)', filters);

  const sql = withWhere(
    `SELECT consumable_stock_transactions.id, consumable_stock_transactions.transaction_date,
            consumable_stock_transactions.quantity, consumable_stock_transactions.stock_before,
            consumable_stock_transactions.stock_after, consumable_stock_transactions.source_type,
            consumables.name AS consumable_name,
            CONCAT(COALESCE(rooms.code, '-'), ' - ', COALESCE(rooms.name, 'Tanpa ruangan')) AS room_label,
            users.full_name AS created_by_name
     FROM consumable_stock_transactions
     INNER JOIN consumables ON consumables.id = consumable_stock_transactions.consumable_id
     LEFT JOIN rooms ON rooms.id = consumables.room_id
     LEFT JOIN users ON users.id = consumable_stock_transactions.created_by_user_id`,
    where
  );

  return {
    sql,
    params,
    orderBy: 'ORDER BY consumable_stock_transactions.transaction_date DESC, consumable_stock_transactions.id DESC',
  };
}

function buildMaintenanceQuery(filters = {}) {
  const where = [];
  const params = [];

  if (filters.search) {
    where.push('(assets.inventory_number LIKE ? OR assets.name LIKE ? OR maintenance_logs.description LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  if (filters.roomId) {
    where.push('assets.room_id = ?');
    params.push(filters.roomId);
  }

  if (filters.status) {
    where.push('maintenance_logs.status_after = ?');
    params.push(filters.status);
  }

  if (filters.condition) {
    where.push('maintenance_logs.condition_after = ?');
    params.push(filters.condition);
  }

  addDateFilter(where, params, 'maintenance_logs.maintenance_date', filters);

  const sql = withWhere(
    `SELECT maintenance_logs.id, maintenance_logs.maintenance_date, maintenance_logs.status_after,
            maintenance_logs.condition_after, maintenance_logs.cost,
            assets.inventory_number, assets.name AS asset_name,
            CONCAT(COALESCE(rooms.code, '-'), ' - ', COALESCE(rooms.name, 'Tanpa ruangan')) AS room_label,
            users.full_name AS performed_by_name
     FROM maintenance_logs
     INNER JOIN assets ON assets.id = maintenance_logs.asset_id
     LEFT JOIN rooms ON rooms.id = assets.room_id
     LEFT JOIN users ON users.id = maintenance_logs.performed_by_user_id`,
    where
  );

  return { sql, params, orderBy: 'ORDER BY maintenance_logs.maintenance_date DESC, maintenance_logs.id DESC' };
}

function buildProcurementQuery(filters = {}) {
  const where = [];
  const params = [];

  if (filters.search) {
    where.push('(procurement_drafts.title LIKE ? OR procurement_items.name LIKE ? OR users.full_name LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  if (filters.year) {
    where.push('procurement_drafts.year = ?');
    params.push(filters.year);
  }

  if (filters.status) {
    where.push('procurement_drafts.status = ?');
    params.push(filters.status);
  }

  if (filters.itemType) {
    where.push('procurement_items.item_type = ?');
    params.push(filters.itemType);
  }

  addDateFilter(where, params, 'DATE(procurement_drafts.created_at)', filters);

  const sql = withWhere(
    `SELECT procurement_drafts.id AS draft_id, procurement_drafts.year,
            procurement_drafts.title AS draft_title, procurement_drafts.status AS draft_status,
            procurement_items.name AS item_name, procurement_items.item_type,
            procurement_items.review_status, procurement_items.quantity_requested,
            procurement_items.quantity_approved,
            (procurement_items.quantity_requested * procurement_items.estimated_unit_price) AS estimated_total,
            users.full_name AS creator_name
     FROM procurement_drafts
     INNER JOIN users ON users.id = procurement_drafts.created_by_user_id
     LEFT JOIN procurement_items ON procurement_items.draft_id = procurement_drafts.id`,
    where
  );

  return {
    sql,
    params,
    orderBy: 'ORDER BY procurement_drafts.year DESC, procurement_drafts.updated_at DESC, procurement_items.id ASC',
  };
}

function buildReceivingQuery(filters = {}) {
  const where = [];
  const params = [];

  if (filters.search) {
    where.push(
      `(procurement_items.name LIKE ? OR procurement_drafts.title LIKE ?
        OR receiving_records.supplier_name LIKE ? OR receiving_records.purchase_reference LIKE ?)`
    );
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  if (filters.roomId) {
    where.push('procurement_items.room_id = ?');
    params.push(filters.roomId);
  }

  if (filters.itemType) {
    where.push('procurement_items.item_type = ?');
    params.push(filters.itemType);
  }

  addDateFilter(where, params, 'receiving_records.received_date', filters);

  const sql = withWhere(
    `SELECT receiving_records.id, receiving_records.received_date, receiving_records.received_quantity,
            receiving_records.supplier_name, receiving_records.purchase_reference,
            procurement_items.name AS item_name, procurement_items.item_type,
            CONCAT(COALESCE(rooms.code, '-'), ' - ', COALESCE(rooms.name, 'Tanpa ruangan')) AS room_label,
            users.full_name AS receiver_name
     FROM receiving_records
     INNER JOIN procurement_items ON procurement_items.id = receiving_records.procurement_item_id
     INNER JOIN procurement_drafts ON procurement_drafts.id = procurement_items.draft_id
     LEFT JOIN rooms ON rooms.id = procurement_items.room_id
     LEFT JOIN users ON users.id = receiving_records.receiver_user_id`,
    where
  );

  return { sql, params, orderBy: 'ORDER BY receiving_records.received_date DESC, receiving_records.id DESC' };
}

function buildReportQuery(reportType, filters = {}) {
  if (reportType === REPORT_TYPES.ASSETS) {
    return buildAssetsQuery(filters);
  }

  if (reportType === REPORT_TYPES.CONSUMABLES) {
    return buildConsumablesQuery(filters);
  }

  if (reportType === REPORT_TYPES.CONSUMABLE_USAGE) {
    return buildConsumableUsageQuery(filters);
  }

  if (reportType === REPORT_TYPES.MAINTENANCE) {
    return buildMaintenanceQuery(filters);
  }

  if (reportType === REPORT_TYPES.PROCUREMENT) {
    return buildProcurementQuery(filters);
  }

  if (reportType === REPORT_TYPES.RECEIVING) {
    return buildReceivingQuery(filters);
  }

  return null;
}

async function listReportRows(reportType, filters = {}, pagination = {}) {
  const query = buildReportQuery(reportType, filters);

  if (!query) {
    return null;
  }

  const [rows] = await pool.execute(
    `${query.sql} ${query.orderBy} ${limitOffsetClause(pagination.limit, pagination.offset)}`,
    query.params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM (${query.sql}) AS report_rows`,
    query.params
  );

  return {
    rows,
    total: Number(countRows[0]?.total || 0),
  };
}

async function listReportExportRows(reportType, filters = {}) {
  const query = buildReportQuery(reportType, filters);

  if (!query) {
    return null;
  }

  const [rows] = await pool.execute(`${query.sql} ${query.orderBy}`, query.params);
  return rows;
}

async function listRooms() {
  const [rows] = await pool.execute('SELECT id, code, name FROM rooms ORDER BY name ASC');
  return rows;
}

module.exports = {
  REPORT_TYPES,
  getReportDefinition,
  listReportTypes,
  listReportRows,
  listReportExportRows,
  listRooms,
};
