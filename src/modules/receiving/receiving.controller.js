const { validationResult } = require('express-validator');
const receivingService = require('./receiving.service');
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
    receivedQuantity: body.receivedQuantity || 1,
    receivedDate: body.receivedDate || new Date().toISOString().slice(0, 10),
    supplierName: body.supplierName || '',
    purchaseReference: body.purchaseReference || '',
    note: body.note || '',
  };
}

function handleReceivingError(req, res, error, redirectPath) {
  if (error instanceof receivingService.ReceivingError) {
    addFlash(req, 'error', error.message);
    return res.redirect(redirectPath);
  }

  throw error;
}

const index = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const search = req.query.search || '';
  const result = await receivingService.listReceivableItems({ search, ...pagination });

  res.render('receiving/index', {
    title: 'Penerimaan Barang',
    items: result.rows,
    search,
    pagination: buildPaginationMeta({ ...pagination, total: result.total }),
  });
});

const receiveForm = asyncHandler(async (req, res, next) => {
  const item = await receivingService.getReceivableItem(Number(req.params.itemId));

  if (!item) {
    return next();
  }

  const records = await receivingService.listReceivingRecords(item.id);

  res.render('receiving/form', {
    title: 'Catat Penerimaan',
    item,
    records,
    formData: formData(),
    errors: {},
  });
});

const receive = asyncHandler(async (req, res, next) => {
  const item = await receivingService.getReceivableItem(Number(req.params.itemId));

  if (!item) {
    return next();
  }

  const result = validationResult(req);
  const data = formData(req.body);
  const records = await receivingService.listReceivingRecords(item.id);

  if (!result.isEmpty()) {
    return res.status(422).render('receiving/form', {
      title: 'Catat Penerimaan',
      item,
      records,
      formData: data,
      errors: mapErrors(result),
    });
  }

  try {
    await receivingService.createReceivingRecord(item.id, data, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Penerimaan barang berhasil dicatat.');
    return res.redirect('/receiving');
  } catch (error) {
    return handleReceivingError(req, res, error, `/receiving/items/${item.id}/receive`);
  }
});

module.exports = {
  index,
  receiveForm,
  receive,
};
