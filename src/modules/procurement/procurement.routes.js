const express = require('express');
const procurementController = require('./procurement.controller');
const { draftRules, itemRules, rejectRules } = require('./procurement.validator');
const { requireAuth, requireRole } = require('../../middlewares');
const { ROLES } = require('../../shared/constants');

const router = express.Router();

router.use(requireAuth);

router.get('/drafts', requireRole(ROLES.KEPALA_LABORATORIUM), procurementController.listDrafts);
router.get('/drafts/new', requireRole(ROLES.KEPALA_LABORATORIUM), procurementController.createDraftForm);
router.post('/drafts', requireRole(ROLES.KEPALA_LABORATORIUM), draftRules, procurementController.createDraft);
router.get('/drafts/:draftId', requireRole(ROLES.KEPALA_LABORATORIUM), procurementController.showDraft);
router.get('/drafts/:draftId/edit', requireRole(ROLES.KEPALA_LABORATORIUM), procurementController.editDraftForm);
router.post('/drafts/:draftId', requireRole(ROLES.KEPALA_LABORATORIUM), draftRules, procurementController.updateDraft);
router.post('/drafts/:draftId/submit', requireRole(ROLES.KEPALA_LABORATORIUM), procurementController.submitDraft);
router.get('/drafts/:draftId/items/new', requireRole(ROLES.KEPALA_LABORATORIUM), procurementController.createItemForm);
router.post('/drafts/:draftId/items', requireRole(ROLES.KEPALA_LABORATORIUM), itemRules, procurementController.createItem);
router.get('/drafts/:draftId/items/:itemId/edit', requireRole(ROLES.KEPALA_LABORATORIUM), procurementController.editItemForm);
router.post('/drafts/:draftId/items/:itemId', requireRole(ROLES.KEPALA_LABORATORIUM), itemRules, procurementController.updateItem);
router.post('/drafts/:draftId/items/:itemId/delete', requireRole(ROLES.KEPALA_LABORATORIUM), procurementController.deleteItem);

router.get('/review', requireRole(ROLES.KETUA_PROGRAM_STUDI), procurementController.reviewList);
router.get('/review/:draftId', requireRole(ROLES.KETUA_PROGRAM_STUDI), procurementController.reviewDetail);
router.post('/review/:draftId/items/:itemId/approve', requireRole(ROLES.KETUA_PROGRAM_STUDI), procurementController.approveItem);
router.post('/review/:draftId/items/:itemId/reject', requireRole(ROLES.KETUA_PROGRAM_STUDI), rejectRules, procurementController.rejectItem);
router.post('/review/:draftId/finalize', requireRole(ROLES.KETUA_PROGRAM_STUDI), procurementController.finalizeDraft);

module.exports = router;
