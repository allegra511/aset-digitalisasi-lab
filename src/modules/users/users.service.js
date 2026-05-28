const bcrypt = require('bcrypt');
const { pool } = require('../../../config/database');
const auditService = require('../audit/audit.service');
const { limitOffsetClause } = require('../../shared/helpers/sql');

async function listUsers({ search = '', limit = 10, offset = 0 }) {
  const keyword = `%${search}%`;
  const params = search ? [keyword, keyword, keyword] : [];
  const where = search
    ? 'WHERE users.full_name LIKE ? OR users.email LIKE ? OR roles.label LIKE ?'
    : '';

  const [rows] = await pool.execute(
    `SELECT users.id, users.full_name, users.email, users.username, users.phone,
            users.is_active, users.updated_at, roles.label AS role_label, roles.name AS role_name
     FROM users
     INNER JOIN roles ON roles.id = users.role_id
     ${where}
     ORDER BY users.updated_at DESC
     ${limitOffsetClause(limit, offset)}`,
    params
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM users
     INNER JOIN roles ON roles.id = users.role_id
     ${where}`,
    params
  );

  return {
    rows,
    total: Number(countRows[0]?.total || 0),
  };
}

async function listRoles() {
  const [rows] = await pool.execute('SELECT id, name, label FROM roles ORDER BY label ASC');
  return rows;
}

async function getUserById(id) {
  const [rows] = await pool.execute(
    `SELECT users.id, users.role_id, users.full_name, users.email, users.username,
            users.phone, users.is_active, roles.label AS role_label, roles.name AS role_name
     FROM users
     INNER JOIN roles ON roles.id = users.role_id
     WHERE users.id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function roleExists(roleId) {
  const [rows] = await pool.execute('SELECT id FROM roles WHERE id = ? LIMIT 1', [roleId]);
  return Boolean(rows[0]);
}

async function isEmailTaken(email, exceptId = null) {
  const params = [email];
  let exceptSql = '';

  if (exceptId) {
    exceptSql = ' AND id <> ?';
    params.push(exceptId);
  }

  const [rows] = await pool.execute(`SELECT id FROM users WHERE email = ?${exceptSql} LIMIT 1`, params);
  return Boolean(rows[0]);
}

async function isUsernameTaken(username, exceptId = null) {
  const params = [username];
  let exceptSql = '';

  if (exceptId) {
    exceptSql = ' AND id <> ?';
    params.push(exceptId);
  }

  const [rows] = await pool.execute(`SELECT id FROM users WHERE username = ?${exceptSql} LIMIT 1`, params);
  return Boolean(rows[0]);
}

async function createUser(data, actor, requestMeta = {}) {
  const passwordHash = await bcrypt.hash(data.password, 12);
  const [result] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, username, password_hash, phone, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.roleId,
      data.fullName,
      data.email,
      data.username,
      passwordHash,
      data.phone || null,
      data.isActive ? 1 : 0,
    ]
  );

  await auditService.logAction({
    userId: actor.id,
    action: 'CREATE_USER',
    entity: 'users',
    entityId: result.insertId,
    afterData: { ...data, password: undefined },
    ...requestMeta,
  });

  return result.insertId;
}

async function updateUser(id, data, actor, requestMeta = {}) {
  const before = await getUserById(id);

  await pool.execute(
    `UPDATE users
     SET role_id = ?, full_name = ?, email = ?, username = ?, phone = ?, is_active = ?
     WHERE id = ?`,
    [data.roleId, data.fullName, data.email, data.username, data.phone || null, data.isActive ? 1 : 0, id]
  );

  await auditService.logAction({
    userId: actor.id,
    action: 'UPDATE_USER',
    entity: 'users',
    entityId: id,
    beforeData: before,
    afterData: data,
    ...requestMeta,
  });
}

async function resetPassword(id, password, actor, requestMeta = {}) {
  const passwordHash = await bcrypt.hash(password, 12);

  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);

  await auditService.logAction({
    userId: actor.id,
    action: 'RESET_USER_PASSWORD',
    entity: 'users',
    entityId: id,
    afterData: { passwordReset: true },
    ...requestMeta,
  });
}

async function setUserActive(id, isActive, actor, requestMeta = {}) {
  const before = await getUserById(id);

  await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);

  await auditService.logAction({
    userId: actor.id,
    action: isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
    entity: 'users',
    entityId: id,
    beforeData: before,
    afterData: { isActive },
    ...requestMeta,
  });
}

module.exports = {
  listUsers,
  listRoles,
  getUserById,
  roleExists,
  isEmailTaken,
  isUsernameTaken,
  createUser,
  updateUser,
  resetPassword,
  setUserActive,
};
