const { body } = require('express-validator');

const assetRules = [
  body('inventoryNumber')
    .trim()
    .notEmpty()
    .withMessage('Nomor inventaris wajib diisi.')
    .isLength({ max: 120 })
    .withMessage('Nomor inventaris terlalu panjang.'),
  body('name').trim().notEmpty().withMessage('Nama aset wajib diisi.').isLength({ max: 190 }),
  body('specification').optional({ checkFalsy: true }).trim(),
  body('roomId').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Ruangan tidak valid.'),
  body('assetCondition').isIn(['good', 'fair', 'damaged']).withMessage('Kondisi aset tidak valid.'),
  body('acquisitionDate').optional({ checkFalsy: true }).isISO8601({ strict: true }).withMessage('Tanggal perolehan tidak valid.'),
  body('photoPath').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
];

const softDeleteRules = [
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Alasan soft delete wajib diisi.')
    .isLength({ max: 1000 })
    .withMessage('Alasan terlalu panjang.'),
];

const replacementRules = [
  body('newAssetId').isInt({ min: 1 }).withMessage('Aset pengganti wajib dipilih.'),
  body('replacementDate').isISO8601({ strict: true }).withMessage('Tanggal penggantian tidak valid.'),
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Alasan penggantian wajib diisi.')
    .isLength({ max: 1000 })
    .withMessage('Alasan terlalu panjang.'),
];

module.exports = {
  assetRules,
  softDeleteRules,
  replacementRules,
};
