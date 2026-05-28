const express = require('express');
const maintenanceController = require('./maintenance.controller');
const { maintenanceRules } = require('./maintenance.validator');
const { requireAuth, requireRole } = require('../../middlewares');
const { ROLES } = require('../../shared/constants');

const router = express.Router();

router.use(requireAuth, requireRole(ROLES.STAF_LABORATORIUM));

router.get('/', maintenanceController.index);
router.get('/new', maintenanceController.createForm);
router.get('/assets/:assetId/new', maintenanceController.createForAssetForm);
router.post('/', maintenanceRules, maintenanceController.create);
router.get('/:id', maintenanceController.detail);

module.exports = router;
