const express = require('express');
const usersController = require('./users.controller');
const { createUserRules, resetPasswordRules, updateUserRules } = require('./users.validator');
const { requireAuth, requireRole } = require('../../middlewares');
const { ROLES } = require('../../shared/constants');

const router = express.Router();

router.use(requireAuth, requireRole(ROLES.ADMINISTRATOR));

router.get('/', usersController.index);
router.get('/new', usersController.createForm);
router.post('/', createUserRules, usersController.create);
router.get('/:id/edit', usersController.editForm);
router.post('/:id', updateUserRules, usersController.update);
router.post('/:id/reset-password', resetPasswordRules, usersController.resetPassword);
router.post('/:id/activate', usersController.activate);
router.post('/:id/deactivate', usersController.deactivate);

module.exports = router;
