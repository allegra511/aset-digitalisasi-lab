const { validationResult } = require('express-validator');
const roomsService = require('./rooms.service');
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
    code: body.code || '',
    name: body.name || '',
    location: body.location || '',
    description: body.description || '',
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
  };
}

function roomToForm(room) {
  return {
    code: room.code,
    name: room.name,
    location: room.location || '',
    description: room.description || '',
    isActive: Boolean(room.is_active),
  };
}

function renderForm(res, { title, mode, room = null, data = {}, errors = {} }) {
  res.render('rooms/form', {
    title,
    mode,
    room,
    formData: data,
    errors,
  });
}

const index = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const search = req.query.search || '';
  const result = await roomsService.listRooms({ search, ...pagination });

  res.render('rooms/index', {
    title: 'Manajemen Ruangan',
    rooms: result.rows,
    search,
    pagination: buildPaginationMeta({ ...pagination, total: result.total }),
  });
});

const createForm = (req, res) => {
  renderForm(res, {
    title: 'Tambah Ruangan',
    mode: 'create',
    data: formData(),
  });
};

const create = asyncHandler(async (req, res) => {
  const result = validationResult(req);
  const data = formData(req.body);

  if (!result.isEmpty()) {
    return renderForm(res.status(422), {
      title: 'Tambah Ruangan',
      mode: 'create',
      data,
      errors: mapErrors(result),
    });
  }

  if (await roomsService.isCodeTaken(data.code)) {
    return renderForm(res.status(422), {
      title: 'Tambah Ruangan',
      mode: 'create',
      data,
      errors: { code: 'Kode ruangan sudah digunakan.' },
    });
  }

  await roomsService.createRoom(data, req.session.user, getRequestMeta(req));
  addFlash(req, 'success', 'Ruangan berhasil ditambahkan.');
  return res.redirect('/rooms');
});

const editForm = asyncHandler(async (req, res, next) => {
  const room = await roomsService.getRoomById(req.params.id);

  if (!room) {
    return next();
  }

  return renderForm(res, {
    title: 'Edit Ruangan',
    mode: 'edit',
    room,
    data: roomToForm(room),
  });
});

const update = asyncHandler(async (req, res, next) => {
  const room = await roomsService.getRoomById(req.params.id);

  if (!room) {
    return next();
  }

  const result = validationResult(req);
  const data = formData(req.body);

  if (!result.isEmpty()) {
    return renderForm(res.status(422), {
      title: 'Edit Ruangan',
      mode: 'edit',
      room,
      data,
      errors: mapErrors(result),
    });
  }

  if (await roomsService.isCodeTaken(data.code, room.id)) {
    return renderForm(res.status(422), {
      title: 'Edit Ruangan',
      mode: 'edit',
      room,
      data,
      errors: { code: 'Kode ruangan sudah digunakan.' },
    });
  }

  await roomsService.updateRoom(room.id, data, req.session.user, getRequestMeta(req));
  addFlash(req, 'success', 'Ruangan berhasil diperbarui.');
  return res.redirect('/rooms');
});

const activate = asyncHandler(async (req, res, next) => {
  const room = await roomsService.getRoomById(req.params.id);

  if (!room) {
    return next();
  }

  await roomsService.setRoomActive(room.id, true, req.session.user, getRequestMeta(req));
  addFlash(req, 'success', 'Ruangan berhasil diaktifkan.');
  return res.redirect('/rooms');
});

const deactivate = asyncHandler(async (req, res, next) => {
  const room = await roomsService.getRoomById(req.params.id);

  if (!room) {
    return next();
  }

  await roomsService.setRoomActive(room.id, false, req.session.user, getRequestMeta(req));
  addFlash(req, 'success', 'Ruangan berhasil dinonaktifkan.');
  return res.redirect('/rooms');
});

module.exports = {
  index,
  createForm,
  create,
  editForm,
  update,
  activate,
  deactivate,
};
