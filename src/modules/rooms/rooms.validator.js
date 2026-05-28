const { body } = require('express-validator');

const roomRules = [
  body('code').trim().notEmpty().withMessage('Kode ruangan wajib diisi.').isLength({ max: 60 }),
  body('name').trim().notEmpty().withMessage('Nama ruangan wajib diisi.').isLength({ max: 150 }),
  body('location').optional({ checkFalsy: true }).trim().isLength({ max: 190 }),
  body('description').optional({ checkFalsy: true }).trim(),
  body('isActive').optional().isIn(['on', '1', 'true']),
];

module.exports = {
  roomRules,
};
