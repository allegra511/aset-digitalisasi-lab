const express = require('express');
const authController = require('./auth.controller');
const { loginRules } = require('./auth.validator');
const { redirectIfAuthenticated } = require('../../middlewares');

const router = express.Router();

router.get('/login', redirectIfAuthenticated, authController.showLogin);
router.post('/login', redirectIfAuthenticated, loginRules, authController.login);
router.post('/logout', authController.logout);

module.exports = router;
