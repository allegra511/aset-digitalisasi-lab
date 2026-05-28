const express = require('express');
const assetsController = require('./assets.controller');
const { assetRules, replacementRules, softDeleteRules } = require('./assets.validator');
const { requireAuth, requireRole } = require('../../middlewares');
const { ROLES } = require('../../shared/constants');

const router = express.Router();

router.use(requireAuth);

router.get('/', assetsController.index);
router.get('/receiving/:receivingRecordId/new', requireRole(ROLES.STAF_ADMINISTRASI), assetsController.createFromReceivingForm);
router.post('/receiving/:receivingRecordId', requireRole(ROLES.STAF_ADMINISTRASI), assetRules, assetsController.createFromReceiving);
router.get('/:id/delete', requireRole(ROLES.STAF_LABORATORIUM), assetsController.softDeleteForm);
router.post('/:id/delete', requireRole(ROLES.STAF_LABORATORIUM), softDeleteRules, assetsController.softDelete);
router.get('/:id/replacements/new', requireRole(ROLES.STAF_LABORATORIUM), assetsController.replacementForm);
router.post('/:id/replacements', requireRole(ROLES.STAF_LABORATORIUM), replacementRules, assetsController.replace);
router.get('/:id', assetsController.detail);

module.exports = router;
