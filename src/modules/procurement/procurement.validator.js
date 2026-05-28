const { body } = require('express-validator');

const draftRules = [
  body('year').isInt({ min: 2000, max: 2100 }).withMessage('Tahun pengadaan tidak valid.'),
  body('title').trim().notEmpty().withMessage('Judul draf wajib diisi.').isLength({ max: 190 }),
  body('notes').optional({ checkFalsy: true }).trim(),
];

const itemRules = [
  body('itemType').isIn(['asset', 'consumable']).withMessage('Jenis item harus asset atau consumable.'),
  body('name').trim().notEmpty().withMessage('Nama item wajib diisi.').isLength({ max: 190 }),
  body('specification').optional({ checkFalsy: true }).trim(),
  body('quantityRequested')
    .isInt({ min: 1 })
    .withMessage('Jumlah item minimal 1.'),
  body('estimatedUnitPrice')
    .isFloat({ min: 0 })
    .withMessage('Estimasi harga tidak boleh negatif.'),
  body('roomId').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Ruangan tidak valid.'),
  body('referenceLink').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  body('notes').optional({ checkFalsy: true }).trim(),
  body('replacementCandidateAssetId')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage('Aset pengganti tidak valid.'),
];

const rejectRules = [
  body('reviewNote').trim().notEmpty().withMessage('Catatan wajib diisi saat menolak item.'),
];

module.exports = {
  draftRules,
  itemRules,
  rejectRules,
};
