const { pool } = require('../../../config/database');
const auditService = require('../audit/audit.service');
const { CONSUMABLE_STATUSES } = require('../../shared/constants');
const { limitOffsetClause } = require('../../shared/helpers/sql');

class ConsumableError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ConsumableError';
    this.code = code;
  }
}

function calculateStatus(stock, minimumStock) {
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

async function listConsumables({ search = '', roomId = '', status = '', limit = 10, offset = 0 }) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(consumables.name LIKE ? OR consumables.specification LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (roomId) {
    where.push('consumables.room_id = ?');
    params.push(roomId);
  }

  if (status) {
    where.push('consumables.status = ?');
    params.push(status);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `SELECT consumables.*, rooms.name AS room_name, rooms.code AS room_code
     FROM consumables
     LEFT JOIN rooms ON rooms.id = consumables.room_id
     ${whereSql}
     ORDER BY consumables.updated_at DESC
     ${limitOffsetClause(limit, offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM consumables
     LEFT JOIN rooms ON rooms.id = consumables.room_id
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

async function getConsumableById(id) {
  const [rows] = await pool.execute(
    `SELECT consumables.*, rooms.name AS room_name, rooms.code AS room_code
     FROM consumables
     LEFT JOIN rooms ON rooms.id = consumables.room_id
     WHERE consumables.id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function listTransactions(consumableId) {
  const [rows] = await pool.execute(
    `SELECT consumable_stock_transactions.*, users.full_name AS created_by_name
     FROM consumable_stock_transactions
     LEFT JOIN users ON users.id = consumable_stock_transactions.created_by_user_id
     WHERE consumable_stock_transactions.consumable_id = ?
     ORDER BY consumable_stock_transactions.transaction_date DESC, consumable_stock_transactions.id DESC`,
    [consumableId]
  );

  return rows;
}

async function createConsumable(data, actor, requestMeta = {}) {
  const status = calculateStatus(data.currentStock, data.minimumStock);
  const initialStock = Number(data.currentStock || 0);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO consumables
        (name, specification, unit, current_stock, minimum_stock, status, room_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.specification || null,
        data.unit || 'unit',
        initialStock,
        data.minimumStock || 0,
        status,
        data.roomId || null,
        actor.id,
      ]
    );

    if (initialStock > 0) {
      await connection.execute(
        `INSERT INTO consumable_stock_transactions
          (consumable_id, transaction_type, quantity, stock_before, stock_after,
           source_type, source_id, note, created_by_user_id)
         VALUES (?, 'IN', ?, 0, ?, 'manual', NULL, ?, ?)`,
        [result.insertId, initialStock, initialStock, 'Stok awal BHP.', actor.id]
      );
    }

    await connection.commit();

    await auditService.logAction({
      userId: actor.id,
      action: 'CREATE_CONSUMABLE',
      entity: 'consumables',
      entityId: result.insertId,
      afterData: { ...data, status },
      ...requestMeta,
    });

    if (initialStock > 0) {
      await auditService.logAction({
        userId: actor.id,
        action: 'STOCK_IN',
        entity: 'consumables',
        entityId: result.insertId,
        afterData: { stockAfter: initialStock, source: 'initial_stock' },
        ...requestMeta,
      });
    }

    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateConsumable(id, data, actor, requestMeta = {}) {
  const before = await getConsumableById(id);

  if (!before) {
    throw new ConsumableError('BHP tidak ditemukan.', 'CONSUMABLE_NOT_FOUND');
  }

  const status = calculateStatus(before.current_stock, data.minimumStock);

  await pool.execute(
    `UPDATE consumables
     SET name = ?, specification = ?, unit = ?, minimum_stock = ?, status = ?, room_id = ?
     WHERE id = ?`,
    [data.name, data.specification || null, data.unit || 'unit', data.minimumStock || 0, status, data.roomId || null, id]
  );

  await auditService.logAction({
    userId: actor.id,
    action: 'UPDATE_CONSUMABLE',
    entity: 'consumables',
    entityId: id,
    beforeData: before,
    afterData: { ...data, status },
    ...requestMeta,
  });
}

async function createStockTransaction(consumableId, data, actor, requestMeta = {}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[consumable]] = await connection.execute('SELECT * FROM consumables WHERE id = ? FOR UPDATE', [consumableId]);

    if (!consumable) {
      throw new ConsumableError('BHP tidak ditemukan.', 'CONSUMABLE_NOT_FOUND');
    }

    const quantity = Number(data.quantity);

    if (quantity < 1) {
      throw new ConsumableError('Quantity transaksi minimal 1.', 'INVALID_QUANTITY');
    }

    let stockAfter = Number(consumable.current_stock || 0);

    if (data.transactionType === 'IN') {
      stockAfter += quantity;
    } else if (data.transactionType === 'OUT') {
      stockAfter -= quantity;
    } else if (data.transactionType === 'ADJUSTMENT') {
      stockAfter = quantity;
    } else {
      throw new ConsumableError('Jenis transaksi stok tidak valid.', 'INVALID_TRANSACTION_TYPE');
    }

    if (stockAfter < 0) {
      throw new ConsumableError('Stok BHP tidak boleh negatif.', 'NEGATIVE_STOCK');
    }

    const status = calculateStatus(stockAfter, consumable.minimum_stock);

    const [result] = await connection.execute(
      `INSERT INTO consumable_stock_transactions
        (consumable_id, transaction_type, quantity, stock_before, stock_after,
         source_type, source_id, note, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        consumableId,
        data.transactionType,
        quantity,
        consumable.current_stock,
        stockAfter,
        data.sourceType || 'manual',
        data.sourceId || null,
        data.note || null,
        actor.id,
      ]
    );

    await connection.execute(
      'UPDATE consumables SET current_stock = ?, status = ? WHERE id = ?',
      [stockAfter, status, consumableId]
    );

    await connection.commit();

    const auditAction = data.transactionType === 'IN'
      ? 'STOCK_IN'
      : data.transactionType === 'OUT'
        ? 'STOCK_OUT'
        : 'STOCK_ADJUSTMENT';

    await auditService.logAction({
      userId: actor.id,
      action: auditAction,
      entity: 'consumable_stock_transactions',
      entityId: result.insertId,
      beforeData: { stock: consumable.current_stock },
      afterData: { ...data, stockAfter, status },
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

async function getReceivingConsumableRecord(receivingRecordId) {
  const [rows] = await pool.execute(
    `SELECT receiving_records.*, procurement_items.name AS item_name, procurement_items.item_type,
            procurement_items.specification, procurement_items.room_id, rooms.name AS room_name
     FROM receiving_records
     INNER JOIN procurement_items ON procurement_items.id = receiving_records.procurement_item_id
     LEFT JOIN rooms ON rooms.id = procurement_items.room_id
     WHERE receiving_records.id = ?
     LIMIT 1`,
    [receivingRecordId]
  );

  return rows[0] || null;
}

async function stockInFromReceiving(receivingRecordId, data, actor, requestMeta = {}) {
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
      throw new ConsumableError('Data penerimaan tidak ditemukan.', 'RECEIVING_NOT_FOUND');
    }

    if (record.item_type !== 'consumable') {
      throw new ConsumableError('Stock-in BHP hanya bisa dari receiving item consumable.', 'NOT_CONSUMABLE_RECEIVING');
    }

    const [[existingTransaction]] = await connection.execute(
      `SELECT id FROM consumable_stock_transactions
       WHERE source_type = 'receiving_record' AND source_id = ?
       LIMIT 1`,
      [receivingRecordId]
    );

    if (existingTransaction) {
      throw new ConsumableError('Receiving record ini sudah pernah dimasukkan ke stok BHP.', 'RECEIVING_ALREADY_STOCKED');
    }

    const name = data.name || record.item_name;
    const unit = data.unit || 'unit';
    const roomId = data.roomId || record.room_id || null;
    const minimumStock = Number(data.minimumStock || 0);

    const [[matched]] = await connection.execute(
      `SELECT * FROM consumables
       WHERE name = ? AND unit = ? AND ((room_id IS NULL AND ? IS NULL) OR room_id = ?)
       LIMIT 1
       FOR UPDATE`,
      [name, unit, roomId, roomId]
    );

    let consumableId;
    let stockBefore = 0;
    let stockAfter = Number(record.received_quantity || 0);

    if (matched) {
      consumableId = matched.id;
      stockBefore = Number(matched.current_stock || 0);
      stockAfter = stockBefore + Number(record.received_quantity || 0);
      const status = calculateStatus(stockAfter, matched.minimum_stock);

      await connection.execute(
        'UPDATE consumables SET current_stock = ?, status = ? WHERE id = ?',
        [stockAfter, status, consumableId]
      );
    } else {
      const status = calculateStatus(stockAfter, minimumStock);
      const [insertResult] = await connection.execute(
        `INSERT INTO consumables
          (procurement_item_id, room_id, name, specification, unit, current_stock, minimum_stock, status, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.procurement_item_id,
          roomId,
          name,
          data.specification || record.specification || null,
          unit,
          stockAfter,
          minimumStock,
          status,
          actor.id,
        ]
      );
      consumableId = insertResult.insertId;

      await auditService.logAction({
        userId: actor.id,
        action: 'CREATE_CONSUMABLE',
        entity: 'consumables',
        entityId: consumableId,
        afterData: { name, unit, roomId, stockAfter, status },
        ...requestMeta,
      });
    }

    const [transactionResult] = await connection.execute(
      `INSERT INTO consumable_stock_transactions
        (consumable_id, transaction_type, quantity, stock_before, stock_after,
         source_type, source_id, note, created_by_user_id)
       VALUES (?, 'IN', ?, ?, ?, 'receiving_record', ?, ?, ?)`,
      [
        consumableId,
        record.received_quantity,
        stockBefore,
        stockAfter,
        receivingRecordId,
        data.note || 'Stock in dari penerimaan barang.',
        actor.id,
      ]
    );

    await connection.commit();

    await auditService.logAction({
      userId: actor.id,
      action: 'STOCK_IN',
      entity: 'consumable_stock_transactions',
      entityId: transactionResult.insertId,
      beforeData: { stockBefore },
      afterData: { consumableId, stockAfter, receivingRecordId },
      ...requestMeta,
    });

    return consumableId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  ConsumableError,
  calculateStatus,
  listConsumables,
  listRooms,
  getConsumableById,
  listTransactions,
  createConsumable,
  updateConsumable,
  createStockTransaction,
  getReceivingConsumableRecord,
  stockInFromReceiving,
};
