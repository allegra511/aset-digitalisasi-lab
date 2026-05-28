const { body } = require('express-validator');

const loginRules = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Email atau username wajib diisi.')
    .isLength({ max: 190 })
    .withMessage('Email atau username terlalu panjang.'),
  body('password')
    .notEmpty()
    .withMessage('Password wajib diisi.')
    .isLength({ max: 255 })
    .withMessage('Password terlalu panjang.'),
];

module.exports = {
  loginRules,
};
