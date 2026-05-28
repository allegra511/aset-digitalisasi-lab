const { pool } = require('../../../config/database');
const auditService = require('../audit/audit.service');
const { limitOffsetClause } = require('../../shared/helpers/sql');

async function listRooms({ search = '', limit = 10, offset = 0 }) {
  const keyword = `%${search}%`;
  const params = search ? [keyword, keyword, keyword] : [];
  const where = search ? 'WHERE code LIKE ? OR name LIKE ? OR location LIKE ?' : '';

  const [rows] = await pool.execute(
    `SELECT id, code, name, location, description, is_active, updated_at
     FROM rooms
     ${where}
     ORDER BY updated_at DESC
     ${limitOffsetClause(limit, offset)}`,
    params
  );

  const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM rooms ${where}`, params);

  return {
    rows,
    total: Number(countRows[0]?.total || 0),
  };
}

async function getRoomById(id) {
  const [rows] = await pool.execute(
    'SELECT id, code, name, location, description, is_active FROM rooms WHERE id = ? LIMIT 1',
    [id]
  );

  return rows[0] || null;
}

async function isCodeTaken(code, exceptId = null) {
  const params = [code];
  let exceptSql = '';

  if (exceptId) {
    exceptSql = ' AND id <> ?';
    params.push(exceptId);
  }

  const [rows] = await pool.execute(`SELECT id FROM rooms WHERE code = ?${exceptSql} LIMIT 1`, params);
  return Boolean(rows[0]);
}

async function createRoom(data, actor, requestMeta = {}) {
  const [result] = await pool.execute(
    `INSERT INTO rooms (code, name, location, description, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [data.code, data.name, data.location || null, data.description || null, data.isActive ? 1 : 0]
  );

  await auditService.logAction({
    userId: actor.id,
    action: 'CREATE_ROOM',
    entity: 'rooms',
    entityId: result.insertId,
    afterData: data,
    ...requestMeta,
  });

  return result.insertId;
}

async function updateRoom(id, data, actor, requestMeta = {}) {
  const before = await getRoomById(id);

  await pool.execute(
    `UPDATE rooms
     SET code = ?, name = ?, location = ?, description = ?, is_active = ?
     WHERE id = ?`,
    [data.code, data.name, data.location || null, data.description || null, data.isActive ? 1 : 0, id]
  );

  await auditService.logAction({
    userId: actor.id,
    action: 'UPDATE_ROOM',
    entity: 'rooms',
    entityId: id,
    beforeData: before,
    afterData: data,
    ...requestMeta,
  });
}

async function setRoomActive(id, isActive, actor, requestMeta = {}) {
  const before = await getRoomById(id);

  await pool.execute('UPDATE rooms SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);

  await auditService.logAction({
    userId: actor.id,
    action: isActive ? 'ACTIVATE_ROOM' : 'DEACTIVATE_ROOM',
    entity: 'rooms',
    entityId: id,
    beforeData: before,
    afterData: { isActive },
    ...requestMeta,
  });
}

module.exports = {
  listRooms,
  getRoomById,
  isCodeTaken,
  createRoom,
  updateRoom,
  setRoomActive,
};
