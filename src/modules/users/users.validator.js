const { body } = require('express-validator');

const userRules = [
  body('fullName').trim().notEmpty().withMessage('Nama lengkap wajib diisi.').isLength({ max: 150 }),
  body('email').trim().isEmail().withMessage('Email tidak valid.').isLength({ max: 190 }),
  body('username').trim().notEmpty().withMessage('Username wajib diisi.').isLength({ max: 80 }),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 40 }),
  body('roleId').isInt({ min: 1 }).withMessage('Role wajib dipilih.'),
  body('isActive').optional().isIn(['on', '1', 'true']),
];

const createUserRules = [
  ...userRules,
  body('password').isLength({ min: 8 }).withMessage('Password minimal 8 karakter.').isLength({ max: 255 }),
];

const resetPasswordRules = [
  body('password').isLength({ min: 8 }).withMessage('Password baru minimal 8 karakter.').isLength({ max: 255 }),
];

module.exports = {
  createUserRules,
  updateUserRules: userRules,
  resetPasswordRules,
};
