const bcrypt = require('bcrypt');
const { pool } = require('../../../config/database');
const auditService = require('../audit/audit.service');

class AuthError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

function mapSessionUser(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    username: user.username,
    roleId: user.role_id,
    roleName: user.role_name,
    roleLabel: user.role_label,
  };
}

async function findUserByIdentifier(identifier) {
  const [rows] = await pool.execute(
    `SELECT
        users.id,
        users.role_id,
        users.full_name,
        users.email,
        users.username,
        users.password_hash,
        users.is_active,
        roles.name AS role_name,
        roles.label AS role_label
     FROM users
     INNER JOIN roles ON roles.id = users.role_id
     WHERE users.email = ? OR users.username = ?
     LIMIT 1`,
    [identifier, identifier]
  );

  return rows[0] || null;
}

async function login({ identifier, password, ipAddress, userAgent }) {
  const user = await findUserByIdentifier(identifier);

  if (!user) {
    await auditService.logAction({
      action: 'LOGIN_FAILED',
      entity: 'users',
      afterData: { identifier, reason: 'user_not_found' },
      ipAddress,
      userAgent,
    });

    throw new AuthError('Email/username atau password salah.', 'INVALID_CREDENTIALS');
  }

  if (!user.is_active) {
    await auditService.logAction({
      userId: user.id,
      action: 'LOGIN_FAILED',
      entity: 'users',
      entityId: user.id,
      afterData: { identifier, reason: 'inactive_user' },
      ipAddress,
      userAgent,
    });

    throw new AuthError('Akun tidak aktif. Hubungi administrator.', 'INACTIVE_USER');
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    await auditService.logAction({
      userId: user.id,
      action: 'LOGIN_FAILED',
      entity: 'users',
      entityId: user.id,
      afterData: { identifier, reason: 'wrong_password' },
      ipAddress,
      userAgent,
    });

    throw new AuthError('Email/username atau password salah.', 'INVALID_CREDENTIALS');
  }

  await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

  const sessionUser = mapSessionUser(user);

  await auditService.logAction({
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    entity: 'users',
    entityId: user.id,
    afterData: {
      email: user.email,
      username: user.username,
      role: user.role_name,
    },
    ipAddress,
    userAgent,
  });

  return sessionUser;
}

async function logout({ user, ipAddress, userAgent }) {
  if (!user) {
    return;
  }

  await auditService.logAction({
    userId: user.id,
    action: 'LOGOUT',
    entity: 'users',
    entityId: user.id,
    afterData: {
      email: user.email,
      username: user.username,
      role: user.roleName,
    },
    ipAddress,
    userAgent,
  });
}

module.exports = {
  AuthError,
  login,
  logout,
};
