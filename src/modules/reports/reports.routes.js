const express = require('express');
const reportsController = require('./reports.controller');
const { requireAuth } = require('../../middlewares');

const router = express.Router();

router.use(requireAuth);

router.get('/', reportsController.index);
router.get('/:reportType/export', reportsController.exportReport);
router.get('/:reportType', reportsController.showReport);

module.exports = router;
