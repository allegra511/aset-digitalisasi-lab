const { validationResult } = require('express-validator');
const procurementService = require('./procurement.service');
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

function draftFormData(body = {}) {
  return {
    year: body.year || new Date().getFullYear(),
    title: body.title || '',
    notes: body.notes || '',
  };
}

function draftToForm(draft) {
  return {
    year: draft.year,
    title: draft.title,
    notes: draft.notes || '',
  };
}

function itemFormData(body = {}) {
  return {
    itemType: body.itemType || 'asset',
    name: body.name || '',
    specification: body.specification || '',
    quantityRequested: body.quantityRequested || 1,
    estimatedUnitPrice: body.estimatedUnitPrice || 0,
    roomId: body.roomId || '',
    referenceLink: body.referenceLink || '',
    notes: body.notes || '',
    replacementCandidateAssetId: body.replacementCandidateAssetId || '',
  };
}

function itemToForm(item) {
  return {
    itemType: item.item_type,
    name: item.name,
    specification: item.specification || '',
    quantityRequested: item.quantity_requested,
    estimatedUnitPrice: item.estimated_unit_price,
    roomId: item.room_id || '',
    referenceLink: item.reference_link || '',
    notes: item.notes || '',
    replacementCandidateAssetId: item.replacement_candidate_asset_id || '',
  };
}

async function renderDraftForm(res, { title, mode, draft = null, data = {}, errors = {} }) {
  res.render('procurement/draft-form', {
    title,
    mode,
    draft,
    formData: data,
    errors,
  });
}

async function renderItemForm(res, { title, mode, draft, item = null, data = {}, errors = {} }) {
  const [rooms, replacementCandidates] = await Promise.all([
    procurementService.listActiveRooms(),
    procurementService.listReplacementCandidates(),
  ]);

  res.render('procurement/item-form', {
    title,
    mode,
    draft,
    item,
    rooms,
    replacementCandidates,
    formData: data,
    errors,
  });
}

function handleProcurementError(req, res, error, redirectPath) {
  if (error instanceof procurementService.ProcurementError) {
    addFlash(req, 'error', error.message);
    return res.redirect(redirectPath);
  }

  throw error;
}

const listDrafts = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const search = req.query.search || '';
  const result = await procurementService.listDraftsByCreator(req.session.user.id, { search, ...pagination });

  res.render('procurement/drafts', {
    title: 'Draf Pengadaan',
    drafts: result.rows,
    search,
    pagination: buildPaginationMeta({ ...pagination, total: result.total }),
  });
});

const createDraftForm = asyncHandler(async (req, res) => {
  await renderDraftForm(res, {
    title: 'Buat Draf Pengadaan',
    mode: 'create',
    data: draftFormData(),
  });
});

const createDraft = asyncHandler(async (req, res) => {
  const result = validationResult(req);
  const data = draftFormData(req.body);

  if (!result.isEmpty()) {
    return renderDraftForm(res.status(422), {
      title: 'Buat Draf Pengadaan',
      mode: 'create',
      data,
      errors: mapErrors(result),
    });
  }

  const draftId = await procurementService.createDraft(data, req.session.user, getRequestMeta(req));
  addFlash(req, 'success', 'Draf pengadaan berhasil dibuat.');
  return res.redirect(`/procurement/drafts/${draftId}`);
});

const showDraft = asyncHandler(async (req, res, next) => {
  const draft = await procurementService.getDraftForOwner(Number(req.params.draftId), req.session.user.id);

  if (!draft) {
    return next();
  }

  const items = await procurementService.listItemsByDraft(draft.id);

  res.render('procurement/draft-detail', {
    title: 'Detail Draf Pengadaan',
    draft,
    items,
    isEditable: procurementService.isDraftEditable(draft),
  });
});

const editDraftForm = asyncHandler(async (req, res, next) => {
  const draft = await procurementService.getDraftForOwner(Number(req.params.draftId), req.session.user.id);

  if (!draft) {
    return next();
  }

  if (!procurementService.isDraftEditable(draft)) {
    addFlash(req, 'error', 'Draf yang sudah submitted atau finalized tidak bisa diedit.');
    return res.redirect(`/procurement/drafts/${draft.id}`);
  }

  return renderDraftForm(res, {
    title: 'Edit Draf Pengadaan',
    mode: 'edit',
    draft,
    data: draftToForm(draft),
  });
});

const updateDraft = asyncHandler(async (req, res, next) => {
  const draftId = Number(req.params.draftId);
  const draft = await procurementService.getDraftForOwner(draftId, req.session.user.id);

  if (!draft) {
    return next();
  }

  const result = validationResult(req);
  const data = draftFormData(req.body);

  if (!result.isEmpty()) {
    return renderDraftForm(res.status(422), {
      title: 'Edit Draf Pengadaan',
      mode: 'edit',
      draft,
      data,
      errors: mapErrors(result),
    });
  }

  try {
    await procurementService.updateDraft(draftId, data, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Draf pengadaan berhasil diperbarui.');
    return res.redirect(`/procurement/drafts/${draftId}`);
  } catch (error) {
    return handleProcurementError(req, res, error, `/procurement/drafts/${draftId}`);
  }
});

const submitDraft = asyncHandler(async (req, res) => {
  const draftId = Number(req.params.draftId);

  try {
    await procurementService.submitDraft(draftId, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Draf pengadaan berhasil disubmit.');
  } catch (error) {
    return handleProcurementError(req, res, error, `/procurement/drafts/${draftId}`);
  }

  return res.redirect(`/procurement/drafts/${draftId}`);
});

const createItemForm = asyncHandler(async (req, res, next) => {
  const draft = await procurementService.getDraftForOwner(Number(req.params.draftId), req.session.user.id);

  if (!draft) {
    return next();
  }

  if (!procurementService.isDraftEditable(draft)) {
    addFlash(req, 'error', 'Item hanya bisa ditambahkan pada draf berstatus draft.');
    return res.redirect(`/procurement/drafts/${draft.id}`);
  }

  return renderItemForm(res, {
    title: 'Tambah Item Pengadaan',
    mode: 'create',
    draft,
    data: itemFormData(),
  });
});

const createItem = asyncHandler(async (req, res, next) => {
  const draft = await procurementService.getDraftForOwner(Number(req.params.draftId), req.session.user.id);

  if (!draft) {
    return next();
  }

  const result = validationResult(req);
  const data = itemFormData(req.body);

  if (!result.isEmpty()) {
    return renderItemForm(res.status(422), {
      title: 'Tambah Item Pengadaan',
      mode: 'create',
      draft,
      data,
      errors: mapErrors(result),
    });
  }

  try {
    await procurementService.createItem(draft.id, data, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Item pengadaan berhasil ditambahkan.');
    return res.redirect(`/procurement/drafts/${draft.id}`);
  } catch (error) {
    return handleProcurementError(req, res, error, `/procurement/drafts/${draft.id}`);
  }
});

const editItemForm = asyncHandler(async (req, res, next) => {
  const draft = await procurementService.getDraftForOwner(Number(req.params.draftId), req.session.user.id);

  if (!draft) {
    return next();
  }

  const item = await procurementService.getItemById(Number(req.params.itemId), draft.id);

  if (!item) {
    return next();
  }

  if (!procurementService.isDraftEditable(draft)) {
    addFlash(req, 'error', 'Item pada draf submitted atau finalized tidak bisa diedit.');
    return res.redirect(`/procurement/drafts/${draft.id}`);
  }

  return renderItemForm(res, {
    title: 'Edit Item Pengadaan',
    mode: 'edit',
    draft,
    item,
    data: itemToForm(item),
  });
});

const updateItem = asyncHandler(async (req, res, next) => {
  const draft = await procurementService.getDraftForOwner(Number(req.params.draftId), req.session.user.id);

  if (!draft) {
    return next();
  }

  const item = await procurementService.getItemById(Number(req.params.itemId), draft.id);

  if (!item) {
    return next();
  }

  const result = validationResult(req);
  const data = itemFormData(req.body);

  if (!result.isEmpty()) {
    return renderItemForm(res.status(422), {
      title: 'Edit Item Pengadaan',
      mode: 'edit',
      draft,
      item,
      data,
      errors: mapErrors(result),
    });
  }

  try {
    await procurementService.updateItem(draft.id, item.id, data, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Item pengadaan berhasil diperbarui.');
    return res.redirect(`/procurement/drafts/${draft.id}`);
  } catch (error) {
    return handleProcurementError(req, res, error, `/procurement/drafts/${draft.id}`);
  }
});

const deleteItem = asyncHandler(async (req, res) => {
  const draftId = Number(req.params.draftId);
  const itemId = Number(req.params.itemId);

  try {
    await procurementService.deleteItem(draftId, itemId, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Item pengadaan berhasil dihapus.');
  } catch (error) {
    return handleProcurementError(req, res, error, `/procurement/drafts/${draftId}`);
  }

  return res.redirect(`/procurement/drafts/${draftId}`);
});

const reviewList = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const search = req.query.search || '';
  const result = await procurementService.listSubmittedDrafts({ search, ...pagination });

  res.render('procurement/review-list', {
    title: 'Review Pengadaan',
    drafts: result.rows,
    search,
    pagination: buildPaginationMeta({ ...pagination, total: result.total }),
  });
});

const reviewDetail = asyncHandler(async (req, res, next) => {
  const draft = await procurementService.getDraftById(Number(req.params.draftId));

  if (!draft || draft.status !== 'submitted') {
    return next();
  }

  const items = await procurementService.listItemsByDraft(draft.id);

  res.render('procurement/review-detail', {
    title: 'Detail Review Pengadaan',
    draft,
    items,
  });
});

const approveItem = asyncHandler(async (req, res) => {
  const draftId = Number(req.params.draftId);
  const itemId = Number(req.params.itemId);

  try {
    await procurementService.approveItem(draftId, itemId, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Item berhasil disetujui.');
  } catch (error) {
    return handleProcurementError(req, res, error, `/procurement/review/${draftId}`);
  }

  return res.redirect(`/procurement/review/${draftId}`);
});

const rejectItem = asyncHandler(async (req, res) => {
  const draftId = Number(req.params.draftId);
  const itemId = Number(req.params.itemId);
  const result = validationResult(req);

  if (!result.isEmpty()) {
    addFlash(req, 'error', 'Catatan wajib diisi saat menolak item.');
    return res.redirect(`/procurement/review/${draftId}`);
  }

  try {
    await procurementService.rejectItem(draftId, itemId, req.body.reviewNote, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Item berhasil ditolak.');
  } catch (error) {
    return handleProcurementError(req, res, error, `/procurement/review/${draftId}`);
  }

  return res.redirect(`/procurement/review/${draftId}`);
});

const finalizeDraft = asyncHandler(async (req, res) => {
  const draftId = Number(req.params.draftId);

  try {
    await procurementService.finalizeDraft(draftId, req.session.user, getRequestMeta(req));
    addFlash(req, 'success', 'Draf pengadaan berhasil difinalisasi.');
  } catch (error) {
    return handleProcurementError(req, res, error, `/procurement/review/${draftId}`);
  }

  return res.redirect('/procurement/review');
});

module.exports = {
  listDrafts,
  createDraftForm,
  createDraft,
  showDraft,
  editDraftForm,
  updateDraft,
  submitDraft,
  createItemForm,
  createItem,
  editItemForm,
  updateItem,
  deleteItem,
  reviewList,
  reviewDetail,
  approveItem,
  rejectItem,
  finalizeDraft,
};
