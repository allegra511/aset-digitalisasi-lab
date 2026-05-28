const { validationResult } = require('express-validator');
const consumablesService = require('./consumables.service');
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
    name: body.name || '',
    specification: body.specification || '',
    unit: body.unit || 'unit',
    currentStock: body.currentStock || 0,
    minimumStock: body.minimumStock || 0,
    roomId: body.roomId || '',
  };
}

function consumableToForm(consumable) {
  return {
    name: consumable.name,
    specification: consumable.specification || '',
    unit: consumable.unit || 'unit',
    currentStock: consumable.current_stock || 0,
    minimumStock: consumable.minimum_stock || 0,
    roomId: consumable.room_id || '',
  };
}

function transactionFormData(body = {}) {
  return {
    transactionType: body.transactionType || 'IN',
    quantity: body.quantity || 1,
    note: body.note || '',
  };
}

function receivingFormData(body = {}, record = null) {
  return {
    name: body.name || record?.item_name || '',
    specification: body.specification || record?.specification || '',
    unit: body.unit || 'unit',
    minimumStock: body.minimumStock || 0,
    roomId: body.roomId || record?.room_id || '',
    note: body.note || '',
  };
}

function handleConsumableError(req, res, error, redirectPath) {
  if (error instanceof consumablesService.ConsumableError) {
    addFlash(req, 'error', error.message);
    return res.redirect(redirectPath);
  }

  throw error;
}

async function renderForm(res, { title, mode, consumable = null, data = {}, errors = {} }) {
  const rooms = await consumablesService.listRooms();
  res.render('consumables/form', { title, mode, consumable, rooms, formData: data, errors });
}

const index = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const filters = {
    search: req.query.search || '',
    roomId: req.query.roomId || '',
    status: req.query.status || '',
  };
  const [result, rooms] = await Promise.all([
    consumablesService.listConsumables({ ...filters, ...pagination }),
    consumablesService.listRooms(),
  ]);

  res.render('consumables/index', {
    title: 'Barang Habis Pakai',
    consumables: result.rows,
    rooms,
    filters,
    pagination: buildPaginationMeta({ ...pagination, total: result.total }),
  });
});

const createForm = asyncHandler(async (req, res) => {
  await renderForm(res, {
    title: 'Tambah BHP',
    mode: 'create',
    data: formData(),
  });
});

const create = asyncHandler(async (req, res) => {
  const result = validationResult(req);
  const data = formData(req.body);

  if (!result.isEmpty()) {
    return renderForm(res.status(422), {
      title: 'Tambah BHP',
      mode: 'create',
      data,
      errors: mapErrors(result),
    });
  }

  const id = await consumablesService.createConsumable(data, req.session.user, getRequestMeta(req));
  addFlash(req, 'success', 'BHP berhasil ditambahkan.');
  return res.redirect(`/consumables/${id}`);
});

const detail = asyncHandler(async (req, res, next) => {
  const consumable = await consumablesService.getConsumableById(Number(req.params.id));

  if (!consumable) {
    return next();
  }

  const transactions = await consumablesService.listTransactions(consumable.id);
  res.render('consumables/detail', {
    title: 'Detail BHP',
    consumable,
    transactions,
  });
});

const editForm = asyncHandler(async (req, res, next) => {
  const consumable = await consumablesService.getConsumableById(Number(req.params.id));

  if (!consumable) {
    return next();
  }

  return renderForm(res, {
    title: 'Edit BHP',
    mode: 'edit',
    consumable,
    data: consumableToForm(consumable),
  });
});

const update = asyncHandler(async (req, res, next) => {
  const consumable = await consumablesService.getConsumableById(Number(req.params.id));

  if (!consumable) {
    return next();
  }

  const result = validationResult(req);
  const data = formData(req.body);

  if (!result.isEmpty()) {
    return renderForm(res.status(422), {
      title: 'Edit BHP',
      mode: 'edit',
      consumable,
      data,
      errors: mapErrors(result),
    });
  }

  await consumablesService.updateConsumable(consumable.id, data, req.session.user, getRequestMeta(req));
  addFlash(req, 'success', 'BHP berhasil diperbarui.');
  return res.redirect(`/consumables/${consumable.id}`);
});

const transactionForm = asyncHandler(async (req, res, next) => {
  const consumable = await consumablesService.getConsumableById(Number(req.params.id));

  if (!consumable) {
    return next();
  }

  res.render('consumables/transaction-form', {
    title: 'Transaksi Stok BHP',
    consumable,
    formData: transactionFormData(),
    errors: {},
  });
});

const createTransaction = asyncHandler(async (req, res, next) => {
  const consumable = await consumablesService.getConsumableById(Number(req.params.id));

  if (!consumable) {
    return next();
  }

  const result = validationResult(req);
  const data = transactionFormData(req.body);

  if (!result.isEmpty()) {
    return res.status(422).render('consumables/transaction-form', {
      title: 'Transaksi Stok BHP',
      consumable,
      formData: data,
      errors: mapErrors(result),
    });
  }

  try {
    await consumablesService.createStockTransaction(consumable.id, data, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Transaksi stok berhasil dicatat.');
    return res.redirect(`/consumables/${consumable.id}`);
  } catch (error) {
    return handleConsumableError(req, res, error, `/consumables/${consumable.id}/transactions/new`);
  }
});

const receivingStockInForm = asyncHandler(async (req, res, next) => {
  const record = await consumablesService.getReceivingConsumableRecord(Number(req.params.receivingRecordId));

  if (!record) {
    return next();
  }

  const rooms = await consumablesService.listRooms();

  res.render('consumables/receiving-stock-in-form', {
    title: 'Stock In dari Receiving',
    record,
    rooms,
    formData: receivingFormData({}, record),
    errors: {},
  });
});

const receivingStockIn = asyncHandler(async (req, res, next) => {
  const record = await consumablesService.getReceivingConsumableRecord(Number(req.params.receivingRecordId));

  if (!record) {
    return next();
  }

  const rooms = await consumablesService.listRooms();
  const result = validationResult(req);
  const data = receivingFormData(req.body, record);

  if (!result.isEmpty()) {
    return res.status(422).render('consumables/receiving-stock-in-form', {
      title: 'Stock In dari Receiving',
      record,
      rooms,
      formData: data,
      errors: mapErrors(result),
    });
  }

  try {
    const consumableId = await consumablesService.stockInFromReceiving(record.id, data, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Receiving BHP berhasil dimasukkan ke stok.');
    return res.redirect(`/consumables/${consumableId}`);
  } catch (error) {
    return handleConsumableError(req, res, error, `/consumables/receiving/${record.id}/stock-in`);
  }
});

module.exports = {
  index,
  createForm,
  create,
  detail,
  editForm,
  update,
  transactionForm,
  createTransaction,
  receivingStockInForm,
  receivingStockIn,
};
