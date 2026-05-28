const { validationResult } = require('express-validator');
const assetsService = require('./assets.service');
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

function formData(body = {}, record = null) {
  return {
    inventoryNumber: body.inventoryNumber || '',
    name: body.name || record?.item_name || '',
    specification: body.specification || record?.specification || '',
    roomId: body.roomId || record?.room_id || '',
    assetCondition: body.assetCondition || 'good',
    acquisitionDate: body.acquisitionDate || (record?.received_date ? new Date(record.received_date).toISOString().slice(0, 10) : ''),
    photoPath: body.photoPath || '',
  };
}

function softDeleteFormData(body = {}) {
  return {
    reason: body.reason || '',
  };
}

function replacementFormData(body = {}) {
  return {
    newAssetId: body.newAssetId || '',
    replacementDate: body.replacementDate || new Date().toISOString().slice(0, 10),
    reason: body.reason || '',
  };
}

function handleAssetError(req, res, error, redirectPath) {
  if (error instanceof assetsService.AssetError) {
    addFlash(req, 'error', error.message);
    return res.redirect(redirectPath);
  }

  throw error;
}

const index = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const filters = {
    search: req.query.search || '',
    roomId: req.query.roomId || '',
    status: req.query.status || '',
    condition: req.query.condition || '',
  };
  const [result, rooms] = await Promise.all([
    assetsService.listAssets({ ...filters, ...pagination }),
    assetsService.listRooms(),
  ]);

  res.render('assets/index', {
    title: 'Inventaris Aset',
    assets: result.rows,
    rooms,
    filters,
    pagination: buildPaginationMeta({ ...pagination, total: result.total }),
  });
});

const detail = asyncHandler(async (req, res, next) => {
  const asset = await assetsService.getAssetById(Number(req.params.id));

  if (!asset) {
    return next();
  }

  const histories = await assetsService.getStatusHistory(asset.id);
  const replacements = await assetsService.getReplacementRelations(asset.id);

  res.render('assets/detail', {
    title: 'Detail Aset',
    asset,
    histories,
    replacements,
  });
});

const createFromReceivingForm = asyncHandler(async (req, res, next) => {
  const record = await assetsService.getReceivingRecordForAssetCreation(Number(req.params.receivingRecordId));

  if (!record) {
    return next();
  }

  const rooms = await assetsService.listRooms();

  res.render('assets/form', {
    title: 'Buat Aset Inventaris',
    record,
    rooms,
    formData: formData({}, record),
    errors: {},
  });
});

const createFromReceiving = asyncHandler(async (req, res, next) => {
  const record = await assetsService.getReceivingRecordForAssetCreation(Number(req.params.receivingRecordId));

  if (!record) {
    return next();
  }

  const rooms = await assetsService.listRooms();
  const data = formData(req.body, record);
  const result = validationResult(req);

  if (!result.isEmpty()) {
    return res.status(422).render('assets/form', {
      title: 'Buat Aset Inventaris',
      record,
      rooms,
      formData: data,
      errors: mapErrors(result),
    });
  }

  if (await assetsService.isInventoryNumberTaken(data.inventoryNumber)) {
    return res.status(422).render('assets/form', {
      title: 'Buat Aset Inventaris',
      record,
      rooms,
      formData: data,
      errors: { inventoryNumber: 'Nomor inventaris sudah digunakan.' },
    });
  }

  try {
    const assetId = await assetsService.createAssetFromReceiving(record.id, data, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Aset inventaris berhasil dibuat.');
    return res.redirect(`/assets/${assetId}`);
  } catch (error) {
    return handleAssetError(req, res, error, `/assets/receiving/${record.id}/new`);
  }
});

const softDeleteForm = asyncHandler(async (req, res, next) => {
  const asset = await assetsService.getAssetById(Number(req.params.id));

  if (!asset) {
    return next();
  }

  res.render('assets/delete-form', {
    title: 'Soft Delete Aset',
    asset,
    formData: softDeleteFormData(),
    errors: {},
  });
});

const softDelete = asyncHandler(async (req, res, next) => {
  const asset = await assetsService.getAssetById(Number(req.params.id));

  if (!asset) {
    return next();
  }

  const data = softDeleteFormData(req.body);
  const result = validationResult(req);

  if (!result.isEmpty()) {
    return res.status(422).render('assets/delete-form', {
      title: 'Soft Delete Aset',
      asset,
      formData: data,
      errors: mapErrors(result),
    });
  }

  try {
    await assetsService.softDeleteAsset(asset.id, data, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Aset berhasil di-soft delete dan histori tetap tersimpan.');
    return res.redirect(`/assets/${asset.id}`);
  } catch (error) {
    return handleAssetError(req, res, error, `/assets/${asset.id}/delete`);
  }
});

const replacementForm = asyncHandler(async (req, res, next) => {
  const asset = await assetsService.getAssetById(Number(req.params.id));

  if (!asset) {
    return next();
  }

  const candidates = await assetsService.listReplacementCandidates(asset.id);

  res.render('assets/replacement-form', {
    title: 'Replacement Aset',
    asset,
    candidates,
    formData: replacementFormData(),
    errors: {},
  });
});

const replace = asyncHandler(async (req, res, next) => {
  const asset = await assetsService.getAssetById(Number(req.params.id));

  if (!asset) {
    return next();
  }

  const candidates = await assetsService.listReplacementCandidates(asset.id);
  const data = replacementFormData(req.body);
  const result = validationResult(req);

  if (!result.isEmpty()) {
    return res.status(422).render('assets/replacement-form', {
      title: 'Replacement Aset',
      asset,
      candidates,
      formData: data,
      errors: mapErrors(result),
    });
  }

  if (String(data.newAssetId) === String(asset.id)) {
    return res.status(422).render('assets/replacement-form', {
      title: 'Replacement Aset',
      asset,
      candidates,
      formData: data,
      errors: { newAssetId: 'Aset pengganti tidak boleh sama dengan aset lama.' },
    });
  }

  try {
    await assetsService.replaceAsset(asset.id, data, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Relasi replacement aset berhasil dicatat.');
    return res.redirect(`/assets/${asset.id}`);
  } catch (error) {
    return handleAssetError(req, res, error, `/assets/${asset.id}/replacements/new`);
  }
});

module.exports = {
  index,
  detail,
  createFromReceivingForm,
  createFromReceiving,
  softDeleteForm,
  softDelete,
  replacementForm,
  replace,
};
