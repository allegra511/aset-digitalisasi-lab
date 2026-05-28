const { pool } = require('../../../config/database');
const auditService = require('../audit/audit.service');
const {
  DRAFT_STATUSES,
  PROCUREMENT_ITEM_STATUSES,
  RECEIVING_STATUSES,
} = require('../../shared/constants');
const { limitOffsetClause } = require('../../shared/helpers/sql');

class ReceivingError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ReceivingError';
    this.code = code;
  }
}

async function listReceivableItems({ search = '', limit = 10, offset = 0 }) {
  const keyword = `%${search}%`;
  const params = [
    DRAFT_STATUSES.FINALIZED,
    PROCUREMENT_ITEM_STATUSES.APPROVED,
    RECEIVING_STATUSES.FULLY_RECEIVED,
  ];
  const searchSql = search ? 'AND (procurement_items.name LIKE ? OR procurement_drafts.title LIKE ?)' : '';

  if (search) {
    params.push(keyword, keyword);
  }

  const [rows] = await pool.execute(
    `SELECT procurement_items.id, procurement_items.name, procurement_items.item_type,
            procurement_items.quantity_approved, procurement_items.receiving_status,
            procurement_drafts.title AS draft_title,
            COALESCE(SUM(receiving_records.received_quantity), 0) AS received_quantity
     FROM procurement_items
     INNER JOIN procurement_drafts ON procurement_drafts.id = procurement_items.draft_id
     LEFT JOIN receiving_records ON receiving_records.procurement_item_id = procurement_items.id
     WHERE procurement_drafts.status = ?
       AND procurement_items.review_status = ?
       AND procurement_items.receiving_status <> ?
       ${searchSql}
     GROUP BY procurement_items.id
     ORDER BY procurement_items.updated_at DESC
     ${limitOffsetClause(limit, offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM procurement_items
     INNER JOIN procurement_drafts ON procurement_drafts.id = procurement_items.draft_id
     WHERE procurement_drafts.status = ?
       AND procurement_items.review_status = ?
       AND procurement_items.receiving_status <> ?
       ${searchSql}`,
    params
  );

  return {
    rows: rows.map((item) => ({
      ...item,
      remaining_quantity: Number(item.quantity_approved || 0) - Number(item.received_quantity || 0),
    })),
    total: Number(countRows[0]?.total || 0),
  };
}

async function getReceivableItem(itemId) {
  const [rows] = await pool.execute(
    `SELECT procurement_items.*, procurement_drafts.status AS draft_status,
            procurement_drafts.title AS draft_title,
            rooms.name AS room_name,
            COALESCE(SUM(receiving_records.received_quantity), 0) AS received_quantity
     FROM procurement_items
     INNER JOIN procurement_drafts ON procurement_drafts.id = procurement_items.draft_id
     LEFT JOIN rooms ON rooms.id = procurement_items.room_id
     LEFT JOIN receiving_records ON receiving_records.procurement_item_id = procurement_items.id
     WHERE procurement_items.id = ?
     GROUP BY procurement_items.id
     LIMIT 1`,
    [itemId]
  );

  const item = rows[0] || null;

  if (!item) {
    return null;
  }

  item.remaining_quantity = Number(item.quantity_approved || 0) - Number(item.received_quantity || 0);
  return item;
}

async function listReceivingRecords(itemId = null) {
  const params = [];
  const where = itemId ? 'WHERE receiving_records.procurement_item_id = ?' : '';

  if (itemId) {
    params.push(itemId);
  }

  const [rows] = await pool.execute(
    `SELECT receiving_records.*, procurement_items.name AS item_name, procurement_items.item_type,
            users.full_name AS receiver_name
     FROM receiving_records
     INNER JOIN procurement_items ON procurement_items.id = receiving_records.procurement_item_id
     INNER JOIN users ON users.id = receiving_records.receiver_user_id
     ${where}
     ORDER BY receiving_records.received_date DESC, receiving_records.id DESC`,
    params
  );

  return rows;
}

async function createReceivingRecord(itemId, data, actor, requestMeta = {}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[item]] = await connection.execute(
      `SELECT procurement_items.*, procurement_drafts.status AS draft_status
       FROM procurement_items
       INNER JOIN procurement_drafts ON procurement_drafts.id = procurement_items.draft_id
       WHERE procurement_items.id = ?
       FOR UPDATE`,
      [itemId]
    );

    if (!item) {
      throw new ReceivingError('Item pengadaan tidak ditemukan.', 'ITEM_NOT_FOUND');
    }

    if (item.draft_status !== DRAFT_STATUSES.FINALIZED || item.review_status !== PROCUREMENT_ITEM_STATUSES.APPROVED) {
      throw new ReceivingError('Hanya item approved dari draf finalized yang bisa diterima.', 'ITEM_NOT_RECEIVABLE');
    }

    const [[receivedRow]] = await connection.execute(
      'SELECT COALESCE(SUM(received_quantity), 0) AS total FROM receiving_records WHERE procurement_item_id = ?',
      [itemId]
    );

    const approvedQuantity = Number(item.quantity_approved || 0);
    const receivedQuantity = Number(receivedRow.total || 0);
    const remainingQuantity = approvedQuantity - receivedQuantity;
    const requestedQuantity = Number(data.receivedQuantity);

    if (requestedQuantity < 1) {
      throw new ReceivingError('Jumlah penerimaan minimal 1.', 'INVALID_QUANTITY');
    }

    if (requestedQuantity > remainingQuantity) {
      throw new ReceivingError('Jumlah diterima tidak boleh melebihi sisa quantity approved.', 'OVER_RECEIVE');
    }

    const [result] = await connection.execute(
      `INSERT INTO receiving_records
        (procurement_item_id, received_quantity, received_date, receiver_user_id, supplier_name, purchase_reference, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        itemId,
        requestedQuantity,
        data.receivedDate,
        actor.id,
        data.supplierName || null,
        data.purchaseReference || null,
        data.note || null,
      ]
    );

    const totalReceived = receivedQuantity + requestedQuantity;
    const receivingStatus =
      totalReceived >= approvedQuantity ? RECEIVING_STATUSES.FULLY_RECEIVED : RECEIVING_STATUSES.PARTIALLY_RECEIVED;

    await connection.execute(
      'UPDATE procurement_items SET receiving_status = ? WHERE id = ?',
      [receivingStatus, itemId]
    );

    await connection.commit();

    await auditService.logAction({
      userId: actor.id,
      action: 'RECEIVE_ITEM',
      entity: 'receiving_records',
      entityId: result.insertId,
      beforeData: { receivedQuantity, remainingQuantity, receivingStatus: item.receiving_status },
      afterData: { ...data, totalReceived, receivingStatus },
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

module.exports = {
  ReceivingError,
  listReceivableItems,
  getReceivableItem,
  listReceivingRecords,
  createReceivingRecord,
};
