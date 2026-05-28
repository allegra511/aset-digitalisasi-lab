const express = require('express');
const dashboardController = require('./dashboard.controller');
const { requireAuth } = require('../../middlewares');

const router = express.Router();

router.get('/', requireAuth, dashboardController.showDashboard);

module.exports = router;
