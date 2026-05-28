const { validationResult } = require('express-validator');
const usersService = require('./users.service');
const { addFlash, asyncHandler, buildPaginationMeta, getPagination } = require('../../shared/helpers');

function getRequestMeta(req) {
  return {
    ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null,
    userAgent: req.get('user-agent') || null,
  };
}

function mapErrors(result) {
  return result.array().reduce((errors, error) => {
    errors[error.path] = error.msg;
    return errors;
  }, {});
}

function formData(body = {}) {
  return {
    fullName: body.fullName || '',
    email: body.email || '',
    username: body.username || '',
    phone: body.phone || '',
    roleId: body.roleId || '',
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
  };
}

function userToForm(user) {
  return {
    fullName: user.full_name,
    email: user.email,
    username: user.username,
    phone: user.phone || '',
    roleId: user.role_id,
    isActive: Boolean(user.is_active),
  };
}

async function renderForm(res, { title, mode, user = null, data = {}, errors = {} }) {
  const roles = await usersService.listRoles();

  res.render('users/form', {
    title,
    mode,
    user,
    roles,
    formData: data,
    errors,
  });
}

const index = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const search = req.query.search || '';
  const result = await usersService.listUsers({ search, ...pagination });

  res.render('users/index', {
    title: 'Manajemen Pengguna',
    users: result.rows,
    search,
    pagination: buildPaginationMeta({ ...pagination, total: result.total }),
  });
});

const createForm = asyncHandler(async (req, res) => {
  await renderForm(res, {
    title: 'Tambah Pengguna',
    mode: 'create',
    data: formData(),
  });
});

const create = asyncHandler(async (req, res) => {
  const result = validationResult(req);
  const data = formData(req.body);
  data.password = req.body.password;

  if (!result.isEmpty()) {
    return renderForm(res.status(422), {
      title: 'Tambah Pengguna',
      mode: 'create',
      data,
      errors: mapErrors(result),
    });
  }

  const errors = {};

  if (!(await usersService.roleExists(data.roleId))) {
    errors.roleId = 'Role tidak ditemukan.';
  }

  if (await usersService.isEmailTaken(data.email)) {
    errors.email = 'Email sudah digunakan.';
  }

  if (await usersService.isUsernameTaken(data.username)) {
    errors.username = 'Username sudah digunakan.';
  }

  if (Object.keys(errors).length) {
    return renderForm(res.status(422), {
      title: 'Tambah Pengguna',
      mode: 'create',
      data,
      errors,
    });
  }

  await usersService.createUser(data, req.session.user, getRequestMeta(req));
  addFlash(req, 'success', 'Pengguna berhasil ditambahkan.');
  return res.redirect('/users');
});

const editForm = asyncHandler(async (req, res, next) => {
  const user = await usersService.getUserById(req.params.id);

  if (!user) {
    return next();
  }

  return renderForm(res, {
    title: 'Edit Pengguna',
    mode: 'edit',
    user,
    data: userToForm(user),
  });
});

const update = asyncHandler(async (req, res, next) => {
  const user = await usersService.getUserById(req.params.id);

  if (!user) {
    return next();
  }

  const result = validationResult(req);
  const data = formData(req.body);

  if (!result.isEmpty()) {
    return renderForm(res.status(422), {
      title: 'Edit Pengguna',
      mode: 'edit',
      user,
      data,
      errors: mapErrors(result),
    });
  }

  const errors = {};

  if (!(await usersService.roleExists(data.roleId))) {
    errors.roleId = 'Role tidak ditemukan.';
  }

  if (await usersService.isEmailTaken(data.email, user.id)) {
    errors.email = 'Email sudah digunakan.';
  }

  if (await usersService.isUsernameTaken(data.username, user.id)) {
    errors.username = 'Username sudah digunakan.';
  }

  if (Object.keys(errors).length) {
    return renderForm(res.status(422), {
      title: 'Edit Pengguna',
      mode: 'edit',
      user,
      data,
      errors,
    });
  }

  await usersService.updateUser(user.id, data, req.session.user, getRequestMeta(req));
  addFlash(req, 'success', 'Pengguna berhasil diperbarui.');
  return res.redirect('/users');
});

const resetPassword = asyncHandler(async (req, res, next) => {
  const user = await usersService.getUserById(req.params.id);

  if (!user) {
    return next();
  }

  const result = validationResult(req);

  if (!result.isEmpty()) {
    return renderForm(res.status(422), {
      title: 'Edit Pengguna',
      mode: 'edit',
      user,
      data: userToForm(user),
      errors: mapErrors(result),
    });
  }

  await usersService.resetPassword(user.id, req.body.password, req.session.user, getRequestMeta(req));
  addFlash(req, 'success', 'Password pengguna berhasil direset.');
  return res.redirect(`/users/${user.id}/edit`);
});

const activate = asyncHandler(async (req, res, next) => {
  const user = await usersService.getUserById(req.params.id);

  if (!user) {
    return next();
  }

  await usersService.setUserActive(user.id, true, req.session.user, getRequestMeta(req));
  addFlash(req, 'success', 'Pengguna berhasil diaktifkan.');
  return res.redirect('/users');
});

const deactivate = asyncHandler(async (req, res, next) => {
  const user = await usersService.getUserById(req.params.id);

  if (!user) {
    return next();
  }

  await usersService.setUserActive(user.id, false, req.session.user, getRequestMeta(req));
  addFlash(req, 'success', 'Pengguna berhasil dinonaktifkan.');
  return res.redirect('/users');
});

module.exports = {
  index,
  createForm,
  create,
  editForm,
  update,
  resetPassword,
  activate,
  deactivate,
};
