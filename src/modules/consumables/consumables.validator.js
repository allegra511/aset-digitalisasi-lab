const { body } = require('express-validator');

const consumableRules = [
  body('name').trim().notEmpty().withMessage('Nama BHP wajib diisi.').isLength({ max: 190 }),
  body('specification').optional({ checkFalsy: true }).trim(),
  body('unit').trim().notEmpty().withMessage('Satuan wajib diisi.').isLength({ max: 40 }),
  body('minimumStock').isInt({ min: 0 }).withMessage('Stok minimum tidak boleh negatif.'),
  body('currentStock').optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage('Stok awal tidak boleh negatif.'),
  body('roomId').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Ruangan tidak valid.'),
];

const transactionRules = [
  body('transactionType').isIn(['IN', 'OUT', 'ADJUSTMENT']).withMessage('Jenis transaksi tidak valid.'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity transaksi minimal 1.'),
  body('note').optional({ checkFalsy: true }).trim(),
];

const receivingStockInRules = [
  body('name').optional({ checkFalsy: true }).trim().isLength({ max: 190 }),
  body('specification').optional({ checkFalsy: true }).trim(),
  body('unit').trim().notEmpty().withMessage('Satuan wajib diisi.').isLength({ max: 40 }),
  body('minimumStock').isInt({ min: 0 }).withMessage('Stok minimum tidak boleh negatif.'),
  body('roomId').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Ruangan tidak valid.'),
  body('note').optional({ checkFalsy: true }).trim(),
];

module.exports = {
  consumableRules,
  transactionRules,
  receivingStockInRules,
};
