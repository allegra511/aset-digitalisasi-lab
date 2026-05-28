const { body } = require('express-validator');

const maintenanceRules = [
  body('assetId').isInt({ min: 1 }).withMessage('Aset wajib dipilih.'),
  body('maintenanceDate').isISO8601({ strict: true }).withMessage('Tanggal maintenance tidak valid.'),
  body('description').trim().notEmpty().withMessage('Deskripsi maintenance wajib diisi.'),
  body('conditionBefore').optional({ checkFalsy: true }).isIn(['good', 'fair', 'damaged']).withMessage('Kondisi sebelum tidak valid.'),
  body('conditionAfter').isIn(['good', 'fair', 'damaged']).withMessage('Kondisi setelah tidak valid.'),
  body('statusAfter').isIn(['active', 'maintenance', 'damaged']).withMessage('Status setelah maintenance tidak valid.'),
  body('cost').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Biaya tidak boleh negatif.'),
  body('consumableIds').optional(),
  body('consumableQuantities').optional(),
];

module.exports = {
  maintenanceRules,
};
