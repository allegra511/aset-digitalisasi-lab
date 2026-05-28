const express = require('express');
const auditController = require('./audit.controller');
const { requireAuth, requireRole } = require('../../middlewares');
const { ROLES } = require('../../shared/constants');

const router = express.Router();

router.use(requireAuth, requireRole(ROLES.ADMINISTRATOR));

router.get('/', auditController.index);
router.get('/:id', auditController.detail);

module.exports = router;
