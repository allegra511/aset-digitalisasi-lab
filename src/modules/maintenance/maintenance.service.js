const { pool } = require('../../../config/database');
const auditService = require('../audit/audit.service');
const { ASSET_STATUSES, CONSUMABLE_STATUSES } = require('../../shared/constants');
const { limitOffsetClause } = require('../../shared/helpers/sql');

class MaintenanceError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'MaintenanceError';
    this.code = code;
  }
}

function calculateConsumableStatus(stock, minimumStock) {
  const current = Number(stock || 0);
  const minimum = Number(minimumStock || 0);

  if (current <= 0) {
    return CONSUMABLE_STATUSES.OUT_OF_STOCK;
  }

  if (current <= minimum) {
    return CONSUMABLE_STATUSES.LOW_STOCK;
  }

  return CONSUMABLE_STATUSES.AVAILABLE;
}

async function listMaintenanceLogs({ search = '', limit = 10, offset = 0 }) {
  const keyword = `%${search}%`;
  const params = search ? [keyword, keyword] : [];
  const where = search ? 'WHERE assets.name LIKE ? OR assets.inventory_number LIKE ?' : '';

  const [rows] = await pool.execute(
    `SELECT maintenance_logs.*, assets.name AS asset_name, assets.inventory_number,
            users.full_name AS performed_by_name
     FROM maintenance_logs
     INNER JOIN assets ON assets.id = maintenance_logs.asset_id
     LEFT JOIN users ON users.id = maintenance_logs.performed_by_user_id
     ${where}
     ORDER BY maintenance_logs.maintenance_date DESC, maintenance_logs.id DESC
     ${limitOffsetClause(limit, offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM maintenance_logs
     INNER JOIN assets ON assets.id = maintenance_logs.asset_id
     ${where}`,
    params
  );

  return {
    rows,
    total: Number(countRows[0]?.total || 0),
  };
}

async function listAssetsForMaintenance() {
  const [rows] = await pool.execute(
    `SELECT id, inventory_number, name, status, asset_condition
     FROM assets
     WHERE status IN ('active', 'maintenance', 'damaged')
     ORDER BY inventory_number ASC`
  );
  return rows;
}

async function listAvailableConsumables() {
  const [rows] = await pool.execute(
    `SELECT id, name, unit, current_stock, minimum_stock, status
     FROM consumables
     WHERE current_stock > 0
     ORDER BY name ASC`
  );
  return rows;
}

async function getAssetById(assetId) {
  const [rows] = await pool.execute(
    `SELECT assets.*, rooms.name AS room_name
     FROM assets
     LEFT JOIN rooms ON rooms.id = assets.room_id
     WHERE assets.id = ?
     LIMIT 1`,
    [assetId]
  );
  return rows[0] || null;
}

async function getMaintenanceById(id) {
  const [rows] = await pool.execute(
    `SELECT maintenance_logs.*, assets.name AS asset_name, assets.inventory_number,
            users.full_name AS performed_by_name
     FROM maintenance_logs
     INNER JOIN assets ON assets.id = maintenance_logs.asset_id
     LEFT JOIN users ON users.id = maintenance_logs.performed_by_user_id
     WHERE maintenance_logs.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function getMaintenanceConsumables(maintenanceLogId) {
  const [rows] = await pool.execute(
    `SELECT maintenance_consumables.*, consumables.name, consumables.unit
     FROM maintenance_consumables
     INNER JOIN consumables ON consumables.id = maintenance_consumables.consumable_id
     WHERE maintenance_consumables.maintenance_log_id = ?
     ORDER BY consumables.name ASC`,
    [maintenanceLogId]
  );
  return rows;
}

async function createMaintenance(data, actor, requestMeta = {}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[asset]] = await connection.execute('SELECT * FROM assets WHERE id = ? FOR UPDATE', [data.assetId]);

    if (!asset) {
      throw new MaintenanceError('Aset tidak ditemukan.', 'ASSET_NOT_FOUND');
    }

    const rawConsumableUsages = (data.consumables || [])
      .filter((item) => item.consumableId && Number(item.quantityUsed) > 0)
      .map((item) => ({
        consumableId: Number(item.consumableId),
        quantityUsed: Number(item.quantityUsed),
      }));

    const consumableUsages = Array.from(
      rawConsumableUsages
        .reduce((grouped, item) => {
          const existing = grouped.get(item.consumableId) || { consumableId: item.consumableId, quantityUsed: 0 };
          existing.quantityUsed += item.quantityUsed;
          grouped.set(item.consumableId, existing);
          return grouped;
        }, new Map())
        .values()
    );

    const lockedConsumables = new Map();

    for (const usage of consumableUsages) {
      const [[consumable]] = await connection.execute(
        'SELECT * FROM consumables WHERE id = ? FOR UPDATE',
        [usage.consumableId]
      );

      if (!consumable) {
        throw new MaintenanceError('BHP yang dipilih tidak ditemukan.', 'CONSUMABLE_NOT_FOUND');
      }

      if (Number(consumable.current_stock) < usage.quantityUsed) {
        throw new MaintenanceError(`Stok BHP ${consumable.name} tidak cukup.`, 'INSUFFICIENT_STOCK');
      }

      lockedConsumables.set(usage.consumableId, consumable);
    }

    const [logResult] = await connection.execute(
      `INSERT INTO maintenance_logs
        (asset_id, maintenance_date, description, condition_before, condition_after,
         status_after, cost, performed_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.assetId,
        data.maintenanceDate,
        data.description,
        data.conditionBefore || asset.asset_condition,
        data.conditionAfter,
        data.statusAfter,
        data.cost || 0,
        actor.id,
      ]
    );

    for (const usage of consumableUsages) {
      const consumable = lockedConsumables.get(usage.consumableId);
      const stockBefore = Number(consumable.current_stock || 0);
      const stockAfter = stockBefore - usage.quantityUsed;
      const status = calculateConsumableStatus(stockAfter, consumable.minimum_stock);

      await connection.execute(
        `INSERT INTO maintenance_consumables (maintenance_log_id, consumable_id, quantity_used)
         VALUES (?, ?, ?)`,
        [logResult.insertId, usage.consumableId, usage.quantityUsed]
      );

      await connection.execute(
        `INSERT INTO consumable_stock_transactions
          (consumable_id, transaction_type, quantity, stock_before, stock_after,
           source_type, source_id, note, created_by_user_id)
         VALUES (?, 'OUT', ?, ?, ?, 'maintenance_log', ?, ?, ?)`,
        [
          usage.consumableId,
          usage.quantityUsed,
          stockBefore,
          stockAfter,
          logResult.insertId,
          `Pemakaian BHP untuk maintenance aset ${asset.inventory_number}.`,
          actor.id,
        ]
      );

      await connection.execute(
        'UPDATE consumables SET current_stock = ?, status = ? WHERE id = ?',
        [stockAfter, status, usage.consumableId]
      );
    }

    await connection.execute(
      'UPDATE assets SET status = ?, asset_condition = ? WHERE id = ?',
      [data.statusAfter, data.conditionAfter, data.assetId]
    );

    await connection.execute(
      `INSERT INTO asset_status_histories
        (asset_id, previous_status, new_status, previous_condition, new_condition, changed_by_user_id, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.assetId,
        asset.status,
        data.statusAfter,
        asset.asset_condition,
        data.conditionAfter,
        actor.id,
        'Update dari maintenance log.',
      ]
    );

    await connection.commit();

    await auditService.logAction({
      userId: actor.id,
      action: 'CREATE_MAINTENANCE',
      entity: 'maintenance_logs',
      entityId: logResult.insertId,
      beforeData: { assetStatus: asset.status, assetCondition: asset.asset_condition },
      afterData: data,
      ...requestMeta,
    });

    return logResult.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  MaintenanceError,
  listMaintenanceLogs,
  listAssetsForMaintenance,
  listAvailableConsumables,
  getAssetById,
  getMaintenanceById,
  getMaintenanceConsumables,
  createMaintenance,
};
