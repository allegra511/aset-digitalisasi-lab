const express = require('express');
const consumablesController = require('./consumables.controller');
const { consumableRules, receivingStockInRules, transactionRules } = require('./consumables.validator');
const { requireAuth, requireRole } = require('../../middlewares');
const { ROLES } = require('../../shared/constants');

const router = express.Router();
const stockRoles = [ROLES.STAF_ADMINISTRASI, ROLES.STAF_LABORATORIUM];

router.use(requireAuth);

router.get('/', requireRole(...stockRoles), consumablesController.index);
router.get('/new', requireRole(...stockRoles), consumablesController.createForm);
router.post('/', requireRole(...stockRoles), consumableRules, consumablesController.create);
router.get('/receiving/:receivingRecordId/stock-in', requireRole(ROLES.STAF_ADMINISTRASI), consumablesController.receivingStockInForm);
router.post('/receiving/:receivingRecordId/stock-in', requireRole(ROLES.STAF_ADMINISTRASI), receivingStockInRules, consumablesController.receivingStockIn);
router.get('/:id', requireRole(...stockRoles), consumablesController.detail);
router.get('/:id/edit', requireRole(...stockRoles), consumablesController.editForm);
router.post('/:id', requireRole(...stockRoles), consumableRules, consumablesController.update);
router.get('/:id/transactions/new', requireRole(...stockRoles), consumablesController.transactionForm);
router.post('/:id/transactions', requireRole(...stockRoles), transactionRules, consumablesController.createTransaction);

module.exports = router;
