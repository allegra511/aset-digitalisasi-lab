const { pool } = require('../../../config/database');
const { limitOffsetClause } = require('../../shared/helpers/sql');

function normalizeJson(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

async function logAction({
  userId = null,
  action,
  entity,
  entityId = null,
  beforeData = null,
  afterData = null,
  ipAddress = null,
  userAgent = null,
}) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs
        (user_id, action, entity, entity_id, before_data, after_data, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        action,
        entity,
        entityId,
        beforeData ? JSON.stringify(beforeData) : null,
        afterData ? JSON.stringify(afterData) : null,
        ipAddress,
        userAgent,
      ]
    );
  } catch (error) {
    if (process.env.APP_ENV !== 'test' && process.env.NODE_ENV !== 'test') {
      console.warn(`Audit log gagal disimpan: ${error.message}`);
    }
  }
}

async function listAuditLogs({
  search = '',
  action = '',
  entity = '',
  userId = '',
  dateFrom = '',
  dateTo = '',
  limit = 10,
  offset = 0,
}) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(audit_logs.action LIKE ? OR audit_logs.entity LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (action) {
    where.push('audit_logs.action = ?');
    params.push(action);
  }

  if (entity) {
    where.push('audit_logs.entity = ?');
    params.push(entity);
  }

  if (userId) {
    where.push('audit_logs.user_id = ?');
    params.push(userId);
  }

  if (dateFrom) {
    where.push('DATE(audit_logs.created_at) >= ?');
    params.push(dateFrom);
  }

  if (dateTo) {
    where.push('DATE(audit_logs.created_at) <= ?');
    params.push(dateTo);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `SELECT audit_logs.id, audit_logs.user_id, audit_logs.action, audit_logs.entity,
            audit_logs.entity_id, audit_logs.ip_address, audit_logs.created_at,
            users.full_name AS user_name, users.email AS user_email
     FROM audit_logs
     LEFT JOIN users ON users.id = audit_logs.user_id
     ${whereSql}
     ORDER BY audit_logs.created_at DESC, audit_logs.id DESC
     ${limitOffsetClause(limit, offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM audit_logs
     LEFT JOIN users ON users.id = audit_logs.user_id
     ${whereSql}`,
    params
  );

  return {
    rows,
    total: Number(countRows[0]?.total || 0),
  };
}

async function getAuditLogById(id) {
  const [rows] = await pool.execute(
    `SELECT audit_logs.*, users.full_name AS user_name, users.email AS user_email
     FROM audit_logs
     LEFT JOIN users ON users.id = audit_logs.user_id
     WHERE audit_logs.id = ?
     LIMIT 1`,
    [id]
  );

  const log = rows[0] || null;

  if (!log) {
    return null;
  }

  return {
    ...log,
    before_data: normalizeJson(log.before_data),
    after_data: normalizeJson(log.after_data),
  };
}

async function listAuditUsers() {
  const [rows] = await pool.execute(
    `SELECT DISTINCT users.id, users.full_name, users.email
     FROM audit_logs
     INNER JOIN users ON users.id = audit_logs.user_id
     ORDER BY users.full_name ASC`
  );

  return rows;
}

module.exports = {
  logAction,
  listAuditLogs,
  getAuditLogById,
  listAuditUsers,
};
