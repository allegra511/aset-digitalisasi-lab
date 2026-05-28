const { validationResult } = require('express-validator');
const maintenanceService = require('./maintenance.service');
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

function normalizeArray(value) {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function formData(body = {}, asset = null) {
  const ids = normalizeArray(body.consumableIds);
  const quantities = normalizeArray(body.consumableQuantities);

  return {
    assetId: body.assetId || asset?.id || '',
    maintenanceDate: body.maintenanceDate || new Date().toISOString().slice(0, 10),
    description: body.description || '',
    conditionBefore: body.conditionBefore || asset?.asset_condition || 'good',
    conditionAfter: body.conditionAfter || asset?.asset_condition || 'good',
    statusAfter: body.statusAfter || asset?.status || 'active',
    cost: body.cost || 0,
    consumables: ids.map((id, index) => ({
      consumableId: id,
      quantityUsed: quantities[index] || '',
    })),
  };
}

function handleMaintenanceError(req, res, error, redirectPath) {
  if (error instanceof maintenanceService.MaintenanceError) {
    addFlash(req, 'error', error.message);
    return res.redirect(redirectPath);
  }

  throw error;
}

async function renderForm(res, { title, data, errors = {} }) {
  const [assets, consumables] = await Promise.all([
    maintenanceService.listAssetsForMaintenance(),
    maintenanceService.listAvailableConsumables(),
  ]);

  res.render('maintenance/form', {
    title,
    assets,
    consumables,
    formData: data,
    errors,
  });
}

const index = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const search = req.query.search || '';
  const result = await maintenanceService.listMaintenanceLogs({ search, ...pagination });

  res.render('maintenance/index', {
    title: 'Maintenance Aset',
    logs: result.rows,
    search,
    pagination: buildPaginationMeta({ ...pagination, total: result.total }),
  });
});

const createForm = asyncHandler(async (req, res) => {
  await renderForm(res, {
    title: 'Tambah Maintenance',
    data: formData(),
  });
});

const createForAssetForm = asyncHandler(async (req, res, next) => {
  const asset = await maintenanceService.getAssetById(Number(req.params.assetId));

  if (!asset) {
    return next();
  }

  await renderForm(res, {
    title: 'Tambah Maintenance',
    data: formData({}, asset),
  });
});

const create = asyncHandler(async (req, res) => {
  const result = validationResult(req);
  const data = formData(req.body);

  if (!result.isEmpty()) {
    return renderForm(res.status(422), {
      title: 'Tambah Maintenance',
      data,
      errors: mapErrors(result),
    });
  }

  try {
    const id = await maintenanceService.createMaintenance(data, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Maintenance berhasil dicatat.');
    return res.redirect(`/maintenance/${id}`);
  } catch (error) {
    return handleMaintenanceError(req, res, error, '/maintenance/new');
  }
});

const detail = asyncHandler(async (req, res, next) => {
  const log = await maintenanceService.getMaintenanceById(Number(req.params.id));

  if (!log) {
    return next();
  }

  const consumables = await maintenanceService.getMaintenanceConsumables(log.id);

  res.render('maintenance/detail', {
    title: 'Detail Maintenance',
    log,
    consumables,
  });
});

module.exports = {
  index,
  createForm,
  createForAssetForm,
  create,
  detail,
};
