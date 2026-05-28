const express = require('express');
const roomsController = require('./rooms.controller');
const { roomRules } = require('./rooms.validator');
const { requireAuth, requireRole } = require('../../middlewares');
const { ROLES } = require('../../shared/constants');

const router = express.Router();

router.use(requireAuth, requireRole(ROLES.ADMINISTRATOR));

router.get('/', roomsController.index);
router.get('/new', roomsController.createForm);
router.post('/', roomRules, roomsController.create);
router.get('/:id/edit', roomsController.editForm);
router.post('/:id', roomRules, roomsController.update);
router.post('/:id/activate', roomsController.activate);
router.post('/:id/deactivate', roomsController.deactivate);

module.exports = router;
