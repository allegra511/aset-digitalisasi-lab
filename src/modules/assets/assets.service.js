const path = require('path');
const fs = require('fs/promises');
const qrcode = require('qrcode');
const { pool } = require('../../../config/database');
const auditService = require('../audit/audit.service');
const { ASSET_STATUSES } = require('../../shared/constants');
const { limitOffsetClause } = require('../../shared/helpers/sql');

class AssetError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AssetError';
    this.code = code;
  }
}

function sanitizeInventoryNumber(value) {
  return String(value).replace(/[^a-zA-Z0-9-_]/g, '_');
}

async function generateQrCode(inventoryNumber) {
  const fileName = `${sanitizeInventoryNumber(inventoryNumber)}.png`;
  const outputDir = path.join(process.cwd(), 'public', 'qrcodes');
  const outputPath = path.join(outputDir, fileName);

  await fs.mkdir(outputDir, { recursive: true });
  await qrcode.toFile(outputPath, inventoryNumber, {
    width: 320,
    margin: 2,
  });

  return `/qrcodes/${fileName}`;
}

async function listAssets({ search = '', roomId = '', status = '', condition = '', limit = 10, offset = 0 }) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(assets.inventory_number LIKE ? OR assets.name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (roomId) {
    where.push('assets.room_id = ?');
    params.push(roomId);
  }

  if (status) {
    where.push('assets.status = ?');
    params.push(status);
  }

  if (condition) {
    where.push('assets.asset_condition = ?');
    params.push(condition);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `SELECT assets.*, rooms.name AS room_name
     FROM assets
     LEFT JOIN rooms ON rooms.id = assets.room_id
     ${whereSql}
     ORDER BY assets.updated_at DESC
     ${limitOffsetClause(limit, offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM assets
     LEFT JOIN rooms ON rooms.id = assets.room_id
     ${whereSql}`,
    params
  );

  return {
    rows,
    total: Number(countRows[0]?.total || 0),
  };
}

async function listRooms() {
  const [rows] = await pool.execute('SELECT id, code, name FROM rooms ORDER BY name ASC');
  return rows;
}

async function getAssetById(id) {
  const [rows] = await pool.execute(
    `SELECT assets.*, rooms.name AS room_name, procurement_items.name AS procurement_item_name
     FROM assets
     LEFT JOIN rooms ON rooms.id = assets.room_id
     LEFT JOIN procurement_items ON procurement_items.id = assets.procurement_item_id
     WHERE assets.id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function getStatusHistory(assetId) {
  const [rows] = await pool.execute(
    `SELECT asset_status_histories.*, users.full_name AS changed_by_name
     FROM asset_status_histories
     LEFT JOIN users ON users.id = asset_status_histories.changed_by_user_id
     WHERE asset_status_histories.asset_id = ?
     ORDER BY asset_status_histories.changed_at DESC, asset_status_histories.id DESC`,
    [assetId]
  );

  return rows;
}

async function getReplacementRelations(assetId) {
  const [replacedBy] = await pool.execute(
    `SELECT asset_replacements.*, assets.inventory_number, assets.name, assets.status
     FROM asset_replacements
     INNER JOIN assets ON assets.id = asset_replacements.new_asset_id
     WHERE asset_replacements.old_asset_id = ?
     ORDER BY asset_replacements.replacement_date DESC, asset_replacements.id DESC`,
    [assetId]
  );

  const [replaces] = await pool.execute(
    `SELECT asset_replacements.*, assets.inventory_number, assets.name, assets.status
     FROM asset_replacements
     INNER JOIN assets ON assets.id = asset_replacements.old_asset_id
     WHERE asset_replacements.new_asset_id = ?
     ORDER BY asset_replacements.replacement_date DESC, asset_replacements.id DESC`,
    [assetId]
  );

  return {
    replacedBy,
    replaces,
  };
}

async function listReplacementCandidates(oldAssetId) {
  const [rows] = await pool.execute(
    `SELECT id, inventory_number, name, status, asset_condition
     FROM assets
     WHERE id <> ? AND status <> ?
     ORDER BY inventory_number ASC`,
    [oldAssetId, ASSET_STATUSES.DELETED]
  );

  return rows;
}

async function isInventoryNumberTaken(inventoryNumber) {
  const [rows] = await pool.execute('SELECT id FROM assets WHERE inventory_number = ? LIMIT 1', [inventoryNumber]);
  return Boolean(rows[0]);
}

async function getReceivingRecordForAssetCreation(receivingRecordId) {
  const [rows] = await pool.execute(
    `SELECT receiving_records.*, procurement_items.name AS item_name, procurement_items.item_type,
            procurement_items.specification, procurement_items.room_id, rooms.name AS room_name,
            COUNT(assets.id) AS created_assets
     FROM receiving_records
     INNER JOIN procurement_items ON procurement_items.id = receiving_records.procurement_item_id
     LEFT JOIN rooms ON rooms.id = procurement_items.room_id
     LEFT JOIN assets ON assets.receiving_record_id = receiving_records.id
     WHERE receiving_records.id = ?
     GROUP BY receiving_records.id
     LIMIT 1`,
    [receivingRecordId]
  );

  const record = rows[0] || null;

  if (!record) {
    return null;
  }

  record.remaining_assets = Number(record.received_quantity || 0) - Number(record.created_assets || 0);
  return record;
}

async function createAssetFromReceiving(receivingRecordId, data, actor, requestMeta = {}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[record]] = await connection.execute(
      `SELECT receiving_records.*, procurement_items.name AS item_name, procurement_items.item_type,
              procurement_items.specification, procurement_items.room_id
       FROM receiving_records
       INNER JOIN procurement_items ON procurement_items.id = receiving_records.procurement_item_id
       WHERE receiving_records.id = ?
       FOR UPDATE`,
      [receivingRecordId]
    );

    if (!record) {
      throw new AssetError('Data penerimaan tidak ditemukan.', 'RECEIVING_NOT_FOUND');
    }

    if (record.item_type !== 'asset') {
      throw new AssetError('Aset hanya bisa dibuat dari penerimaan item inventaris.', 'NOT_ASSET_ITEM');
    }

    const [[assetCountRow]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM assets WHERE receiving_record_id = ?',
      [receivingRecordId]
    );

    const remainingAssets = Number(record.received_quantity || 0) - Number(assetCountRow.total || 0);

    if (remainingAssets < 1) {
      throw new AssetError('Semua unit dari penerimaan ini sudah dibuat sebagai aset.', 'NO_REMAINING_ASSET');
    }

    const [[duplicate]] = await connection.execute(
      'SELECT id FROM assets WHERE inventory_number = ? LIMIT 1',
      [data.inventoryNumber]
    );

    if (duplicate) {
      throw new AssetError('Nomor inventaris sudah digunakan.', 'DUPLICATE_INVENTORY_NUMBER');
    }

    const qrCodePath = await generateQrCode(data.inventoryNumber);

    const [result] = await connection.execute(
      `INSERT INTO assets
        (procurement_item_id, receiving_record_id, room_id, inventory_number, name, specification,
         status, asset_condition, acquisition_date, photo_path, qr_code_path, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.procurement_item_id,
        receivingRecordId,
        data.roomId || record.room_id || null,
        data.inventoryNumber,
        data.name || record.item_name,
        data.specification || record.specification || null,
        ASSET_STATUSES.ACTIVE,
        data.assetCondition,
        data.acquisitionDate || record.received_date,
        data.photoPath || null,
        qrCodePath,
        actor.id,
      ]
    );

    await connection.execute(
      `INSERT INTO asset_status_histories
        (asset_id, previous_status, new_status, previous_condition, new_condition, changed_by_user_id, note)
       VALUES (?, NULL, ?, NULL, ?, ?, ?)`,
      [result.insertId, ASSET_STATUSES.ACTIVE, data.assetCondition, actor.id, 'Aset dibuat dari penerimaan barang.']
    );

    await connection.commit();

    await auditService.logAction({
      userId: actor.id,
      action: 'CREATE_ASSET',
      entity: 'assets',
      entityId: result.insertId,
      afterData: { ...data, qrCodePath, receivingRecordId },
      ...requestMeta,
    });

    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function softDeleteAsset(assetId, data, actor, requestMeta = {}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[asset]] = await connection.execute('SELECT * FROM assets WHERE id = ? FOR UPDATE', [assetId]);

    if (!asset) {
      throw new AssetError('Aset tidak ditemukan.', 'ASSET_NOT_FOUND');
    }

    if (asset.status === ASSET_STATUSES.DELETED) {
      throw new AssetError('Aset sudah berstatus deleted.', 'ASSET_ALREADY_DELETED');
    }

    await connection.execute(
      'UPDATE assets SET status = ?, deleted_at = NOW() WHERE id = ?',
      [ASSET_STATUSES.DELETED, assetId]
    );

    await connection.execute(
      `INSERT INTO asset_status_histories
        (asset_id, previous_status, new_status, previous_condition, new_condition, changed_by_user_id, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        assetId,
        asset.status,
        ASSET_STATUSES.DELETED,
        asset.asset_condition,
        asset.asset_condition,
        actor.id,
        data.reason,
      ]
    );

    await connection.commit();

    await auditService.logAction({
      userId: actor.id,
      action: 'SOFT_DELETE_ASSET',
      entity: 'assets',
      entityId: assetId,
      beforeData: asset,
      afterData: { status: ASSET_STATUSES.DELETED, reason: data.reason },
      ...requestMeta,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function replaceAsset(oldAssetId, data, actor, requestMeta = {}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const newAssetId = Number(data.newAssetId);

    if (Number(oldAssetId) === newAssetId) {
      throw new AssetError('Aset pengganti tidak boleh sama dengan aset lama.', 'SAME_REPLACEMENT_ASSET');
    }

    const [[oldAsset]] = await connection.execute('SELECT * FROM assets WHERE id = ? FOR UPDATE', [oldAssetId]);
    const [[newAsset]] = await connection.execute('SELECT * FROM assets WHERE id = ? FOR UPDATE', [newAssetId]);

    if (!oldAsset) {
      throw new AssetError('Aset lama tidak ditemukan.', 'OLD_ASSET_NOT_FOUND');
    }

    if (!newAsset) {
      throw new AssetError('Aset pengganti tidak ditemukan.', 'NEW_ASSET_NOT_FOUND');
    }

    if ([ASSET_STATUSES.DELETED, ASSET_STATUSES.REPLACED].includes(oldAsset.status)) {
      throw new AssetError('Aset lama tidak bisa diganti karena sudah deleted/replaced.', 'OLD_ASSET_NOT_REPLACEABLE');
    }

    if (newAsset.status === ASSET_STATUSES.DELETED) {
      throw new AssetError('Aset pengganti tidak boleh berstatus deleted.', 'NEW_ASSET_DELETED');
    }

    const [replacementResult] = await connection.execute(
      `INSERT INTO asset_replacements
        (old_asset_id, new_asset_id, reason, replacement_date, created_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [oldAssetId, newAssetId, data.reason, data.replacementDate, actor.id]
    );

    await connection.execute(
      'UPDATE assets SET status = ?, deleted_at = NULL WHERE id = ?',
      [ASSET_STATUSES.REPLACED, oldAssetId]
    );

    await connection.execute(
      `INSERT INTO asset_status_histories
        (asset_id, previous_status, new_status, previous_condition, new_condition, changed_by_user_id, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        oldAssetId,
        oldAsset.status,
        ASSET_STATUSES.REPLACED,
        oldAsset.asset_condition,
        oldAsset.asset_condition,
        actor.id,
        data.reason,
      ]
    );

    await connection.commit();

    await auditService.logAction({
      userId: actor.id,
      action: 'REPLACE_ASSET',
      entity: 'asset_replacements',
      entityId: replacementResult.insertId,
      beforeData: oldAsset,
      afterData: {
        oldAssetId,
        newAssetId,
        replacementDate: data.replacementDate,
        reason: data.reason,
        oldAssetStatus: ASSET_STATUSES.REPLACED,
      },
      ...requestMeta,
    });

    return replacementResult.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  AssetError,
  listAssets,
  listRooms,
  getAssetById,
  getStatusHistory,
  getReplacementRelations,
  listReplacementCandidates,
  isInventoryNumberTaken,
  getReceivingRecordForAssetCreation,
  createAssetFromReceiving,
  softDeleteAsset,
  replaceAsset,
};
