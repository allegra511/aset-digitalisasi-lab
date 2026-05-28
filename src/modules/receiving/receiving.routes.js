const express = require('express');
const receivingController = require('./receiving.controller');
const { receivingRules } = require('./receiving.validator');
const { requireAuth, requireRole } = require('../../middlewares');
const { ROLES } = require('../../shared/constants');

const router = express.Router();

router.use(requireAuth, requireRole(ROLES.STAF_ADMINISTRASI));

router.get('/', receivingController.index);
router.get('/items/:itemId/receive', receivingController.receiveForm);
router.post('/items/:itemId/receive', receivingRules, receivingController.receive);

module.exports = router;
