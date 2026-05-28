const { pool } = require('../../../config/database');
const auditService = require('../audit/audit.service');
const {
  DRAFT_STATUSES,
  PROCUREMENT_ITEM_STATUSES,
  RECEIVING_STATUSES,
} = require('../../shared/constants');
const { limitOffsetClause } = require('../../shared/helpers/sql');

class ProcurementError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ProcurementError';
    this.code = code;
  }
}

function isDraftEditable(draft) {
  return draft?.status === DRAFT_STATUSES.DRAFT && !draft.is_locked;
}

async function listDraftsByCreator(userId, { search = '', limit = 10, offset = 0 }) {
  const keyword = `%${search}%`;
  const params = search ? [userId, keyword, keyword] : [userId];
  const where = search ? 'AND (title LIKE ? OR status LIKE ?)' : '';

  const [rows] = await pool.execute(
    `SELECT id, year, title, status, is_locked, submitted_at, finalized_at, updated_at
     FROM procurement_drafts
     WHERE created_by_user_id = ? ${where}
     ORDER BY updated_at DESC
     ${limitOffsetClause(limit, offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM procurement_drafts
     WHERE created_by_user_id = ? ${where}`,
    params
  );

  return {
    rows,
    total: Number(countRows[0]?.total || 0),
  };
}

async function listSubmittedDrafts({ search = '', limit = 10, offset = 0 }) {
  const keyword = `%${search}%`;
  const params = search ? [DRAFT_STATUSES.SUBMITTED, keyword, keyword] : [DRAFT_STATUSES.SUBMITTED];
  const where = search ? 'AND (procurement_drafts.title LIKE ? OR users.full_name LIKE ?)' : '';

  const [rows] = await pool.execute(
    `SELECT procurement_drafts.id, procurement_drafts.year, procurement_drafts.title,
            procurement_drafts.status, procurement_drafts.submitted_at, users.full_name AS creator_name
     FROM procurement_drafts
     INNER JOIN users ON users.id = procurement_drafts.created_by_user_id
     WHERE procurement_drafts.status = ? ${where}
     ORDER BY procurement_drafts.submitted_at DESC
     ${limitOffsetClause(limit, offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM procurement_drafts
     INNER JOIN users ON users.id = procurement_drafts.created_by_user_id
     WHERE procurement_drafts.status = ? ${where}`,
    params
  );

  return {
    rows,
    total: Number(countRows[0]?.total || 0),
  };
}

async function getDraftById(id) {
  const [rows] = await pool.execute(
    `SELECT procurement_drafts.*, users.full_name AS creator_name
     FROM procurement_drafts
     INNER JOIN users ON users.id = procurement_drafts.created_by_user_id
     WHERE procurement_drafts.id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function getDraftForOwner(id, userId) {
  const draft = await getDraftById(id);

  if (!draft || draft.created_by_user_id !== userId) {
    return null;
  }

  return draft;
}

async function listItemsByDraft(draftId) {
  const [rows] = await pool.execute(
    `SELECT procurement_items.*, rooms.name AS room_name, assets.inventory_number AS replacement_inventory_number
     FROM procurement_items
     LEFT JOIN rooms ON rooms.id = procurement_items.room_id
     LEFT JOIN assets ON assets.id = procurement_items.replacement_candidate_asset_id
     WHERE procurement_items.draft_id = ?
     ORDER BY procurement_items.created_at ASC, procurement_items.id ASC`,
    [draftId]
  );

  return rows;
}

async function getItemById(itemId, draftId = null) {
  const params = [itemId];
  const draftWhere = draftId ? 'AND draft_id = ?' : '';

  if (draftId) {
    params.push(draftId);
  }

  const [rows] = await pool.execute(
    `SELECT * FROM procurement_items WHERE id = ? ${draftWhere} LIMIT 1`,
    params
  );

  return rows[0] || null;
}

async function listActiveRooms() {
  const [rows] = await pool.execute(
    'SELECT id, code, name FROM rooms WHERE is_active = 1 ORDER BY name ASC'
  );
  return rows;
}

async function listReplacementCandidates() {
  const [rows] = await pool.execute(
    `SELECT id, inventory_number, name
     FROM assets
     WHERE status IN ('active', 'damaged', 'maintenance', 'replaced')
     ORDER BY inventory_number ASC
     LIMIT 100`
  );
  return rows;
}

async function createDraft(data, actor, requestMeta = {}) {
  const [result] = await pool.execute(
    `INSERT INTO procurement_drafts (year, title, status, is_locked, created_by_user_id, notes)
     VALUES (?, ?, ?, 0, ?, ?)`,
    [data.year, data.title, DRAFT_STATUSES.DRAFT, actor.id, data.notes || null]
  );

  await auditService.logAction({
    userId: actor.id,
    action: 'CREATE_DRAFT',
    entity: 'procurement_drafts',
    entityId: result.insertId,
    afterData: data,
    ...requestMeta,
  });

  return result.insertId;
}

async function updateDraft(id, data, actor, requestMeta = {}) {
  const before = await getDraftForOwner(id, actor.id);

  if (!before) {
    throw new ProcurementError('Draf tidak ditemukan.', 'DRAFT_NOT_FOUND');
  }

  if (!isDraftEditable(before)) {
    throw new ProcurementError('Draf yang sudah submitted atau finalized tidak bisa diedit.', 'DRAFT_LOCKED');
  }

  await pool.execute(
    'UPDATE procurement_drafts SET year = ?, title = ?, notes = ? WHERE id = ?',
    [data.year, data.title, data.notes || null, id]
  );

  await auditService.logAction({
    userId: actor.id,
    action: 'UPDATE_DRAFT',
    entity: 'procurement_drafts',
    entityId: id,
    beforeData: before,
    afterData: data,
    ...requestMeta,
  });
}

async function createItem(draftId, data, actor, requestMeta = {}) {
  const draft = await getDraftForOwner(draftId, actor.id);

  if (!draft) {
    throw new ProcurementError('Draf tidak ditemukan.', 'DRAFT_NOT_FOUND');
  }

  if (!isDraftEditable(draft)) {
    throw new ProcurementError('Item hanya bisa ditambahkan pada draf berstatus draft.', 'DRAFT_LOCKED');
  }

  const [result] = await pool.execute(
    `INSERT INTO procurement_items
      (draft_id, item_type, name, specification, quantity_requested, estimated_unit_price,
       room_id, reference_link, notes, replacement_candidate_asset_id, review_status, receiving_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      draftId,
      data.itemType,
      data.name,
      data.specification || null,
      data.quantityRequested,
      data.estimatedUnitPrice,
      data.roomId || null,
      data.referenceLink || null,
      data.notes || null,
      data.replacementCandidateAssetId || null,
      PROCUREMENT_ITEM_STATUSES.DRAFT,
      RECEIVING_STATUSES.NOT_RECEIVED,
    ]
  );

  await auditService.logAction({
    userId: actor.id,
    action: 'CREATE_PROCUREMENT_ITEM',
    entity: 'procurement_items',
    entityId: result.insertId,
    afterData: data,
    ...requestMeta,
  });

  return result.insertId;
}

async function updateItem(draftId, itemId, data, actor, requestMeta = {}) {
  const draft = await getDraftForOwner(draftId, actor.id);

  if (!draft) {
    throw new ProcurementError('Draf tidak ditemukan.', 'DRAFT_NOT_FOUND');
  }

  if (!isDraftEditable(draft)) {
    throw new ProcurementError('Item pada draf submitted atau finalized tidak bisa diedit.', 'DRAFT_LOCKED');
  }

  const before = await getItemById(itemId, draftId);

  if (!before) {
    throw new ProcurementError('Item tidak ditemukan.', 'ITEM_NOT_FOUND');
  }

  await pool.execute(
    `UPDATE procurement_items
     SET item_type = ?, name = ?, specification = ?, quantity_requested = ?, estimated_unit_price = ?,
         room_id = ?, reference_link = ?, notes = ?, replacement_candidate_asset_id = ?
     WHERE id = ?`,
    [
      data.itemType,
      data.name,
      data.specification || null,
      data.quantityRequested,
      data.estimatedUnitPrice,
      data.roomId || null,
      data.referenceLink || null,
      data.notes || null,
      data.replacementCandidateAssetId || null,
      itemId,
    ]
  );

  await auditService.logAction({
    userId: actor.id,
    action: 'UPDATE_PROCUREMENT_ITEM',
    entity: 'procurement_items',
    entityId: itemId,
    beforeData: before,
    afterData: data,
    ...requestMeta,
  });
}

async function deleteItem(draftId, itemId, actor, requestMeta = {}) {
  const draft = await getDraftForOwner(draftId, actor.id);

  if (!draft) {
    throw new ProcurementError('Draf tidak ditemukan.', 'DRAFT_NOT_FOUND');
  }

  if (!isDraftEditable(draft)) {
    throw new ProcurementError('Item pada draf submitted atau finalized tidak bisa dihapus.', 'DRAFT_LOCKED');
  }

  const before = await getItemById(itemId, draftId);

  if (!before) {
    throw new ProcurementError('Item tidak ditemukan.', 'ITEM_NOT_FOUND');
  }

  await pool.execute('DELETE FROM procurement_items WHERE id = ? AND draft_id = ?', [itemId, draftId]);

  await auditService.logAction({
    userId: actor.id,
    action: 'DELETE_PROCUREMENT_ITEM',
    entity: 'procurement_items',
    entityId: itemId,
    beforeData: before,
    ...requestMeta,
  });
}

async function submitDraft(draftId, actor, requestMeta = {}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[draft]] = await connection.execute(
      'SELECT * FROM procurement_drafts WHERE id = ? AND created_by_user_id = ? FOR UPDATE',
      [draftId, actor.id]
    );

    if (!draft) {
      throw new ProcurementError('Draf tidak ditemukan.', 'DRAFT_NOT_FOUND');
    }

    if (!isDraftEditable(draft)) {
      throw new ProcurementError('Draf yang sudah submitted atau finalized tidak bisa disubmit ulang.', 'DRAFT_LOCKED');
    }

    const [[countRow]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM procurement_items WHERE draft_id = ?',
      [draftId]
    );

    if (!Number(countRow.total || 0)) {
      throw new ProcurementError('Draf harus memiliki minimal satu item sebelum submit.', 'EMPTY_DRAFT');
    }

    await connection.execute(
      `UPDATE procurement_drafts
       SET status = ?, submitted_at = NOW()
       WHERE id = ?`,
      [DRAFT_STATUSES.SUBMITTED, draftId]
    );

    await connection.execute(
      `UPDATE procurement_items
       SET review_status = ?
       WHERE draft_id = ?`,
      [PROCUREMENT_ITEM_STATUSES.PENDING_REVIEW, draftId]
    );

    await connection.commit();

    await auditService.logAction({
      userId: actor.id,
      action: 'SUBMIT_DRAFT',
      entity: 'procurement_drafts',
      entityId: draftId,
      beforeData: draft,
      afterData: { status: DRAFT_STATUSES.SUBMITTED },
      ...requestMeta,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function approveItem(draftId, itemId, actor, requestMeta = {}) {
  const item = await getItemById(itemId, draftId);

  if (!item || item.review_status !== PROCUREMENT_ITEM_STATUSES.PENDING_REVIEW) {
    throw new ProcurementError('Item tidak ditemukan atau bukan pending review.', 'ITEM_NOT_REVIEWABLE');
  }

  await pool.execute(
    `UPDATE procurement_items
     SET review_status = ?, quantity_approved = quantity_requested, review_note = NULL,
         reviewed_by_user_id = ?, reviewed_at = NOW()
     WHERE id = ? AND draft_id = ?`,
    [PROCUREMENT_ITEM_STATUSES.APPROVED, actor.id, itemId, draftId]
  );

  await auditService.logAction({
    userId: actor.id,
    action: 'REVIEW_ITEM',
    entity: 'procurement_items',
    entityId: itemId,
    beforeData: item,
    afterData: { reviewStatus: PROCUREMENT_ITEM_STATUSES.APPROVED },
    ...requestMeta,
  });
}

async function rejectItem(draftId, itemId, reviewNote, actor, requestMeta = {}) {
  if (!reviewNote?.trim()) {
    throw new ProcurementError('Catatan wajib diisi saat menolak item.', 'REVIEW_NOTE_REQUIRED');
  }

  const item = await getItemById(itemId, draftId);

  if (!item || item.review_status !== PROCUREMENT_ITEM_STATUSES.PENDING_REVIEW) {
    throw new ProcurementError('Item tidak ditemukan atau bukan pending review.', 'ITEM_NOT_REVIEWABLE');
  }

  await pool.execute(
    `UPDATE procurement_items
     SET review_status = ?, quantity_approved = 0, review_note = ?,
         reviewed_by_user_id = ?, reviewed_at = NOW()
     WHERE id = ? AND draft_id = ?`,
    [PROCUREMENT_ITEM_STATUSES.REJECTED, reviewNote.trim(), actor.id, itemId, draftId]
  );

  await auditService.logAction({
    userId: actor.id,
    action: 'REVIEW_ITEM',
    entity: 'procurement_items',
    entityId: itemId,
    beforeData: item,
    afterData: { reviewStatus: PROCUREMENT_ITEM_STATUSES.REJECTED, reviewNote: reviewNote.trim() },
    ...requestMeta,
  });
}

async function finalizeDraft(draftId, actor, requestMeta = {}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[draft]] = await connection.execute(
      'SELECT * FROM procurement_drafts WHERE id = ? AND status = ? FOR UPDATE',
      [draftId, DRAFT_STATUSES.SUBMITTED]
    );

    if (!draft) {
      throw new ProcurementError('Draf submitted tidak ditemukan.', 'DRAFT_NOT_FOUND');
    }

    const [[pendingRow]] = await connection.execute(
      `SELECT COUNT(*) AS total
       FROM procurement_items
       WHERE draft_id = ? AND review_status NOT IN (?, ?)`,
      [draftId, PROCUREMENT_ITEM_STATUSES.APPROVED, PROCUREMENT_ITEM_STATUSES.REJECTED]
    );

    if (Number(pendingRow.total || 0) > 0) {
      throw new ProcurementError('Semua item harus direview sebelum finalisasi.', 'PENDING_ITEMS');
    }

    await connection.execute(
      `UPDATE procurement_drafts
       SET status = ?, is_locked = 1, finalized_by_user_id = ?, finalized_at = NOW()
       WHERE id = ?`,
      [DRAFT_STATUSES.FINALIZED, actor.id, draftId]
    );

    await connection.commit();

    await auditService.logAction({
      userId: actor.id,
      action: 'FINALIZE_DRAFT',
      entity: 'procurement_drafts',
      entityId: draftId,
      beforeData: draft,
      afterData: { status: DRAFT_STATUSES.FINALIZED, isLocked: true },
      ...requestMeta,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  ProcurementError,
  isDraftEditable,
  listDraftsByCreator,
  listSubmittedDrafts,
  getDraftById,
  getDraftForOwner,
  listItemsByDraft,
  getItemById,
  listActiveRooms,
  listReplacementCandidates,
  createDraft,
  updateDraft,
  createItem,
  updateItem,
  deleteItem,
  submitDraft,
  approveItem,
  rejectItem,
  finalizeDraft,
};
