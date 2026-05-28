const { body } = require('express-validator');

const receivingRules = [
  body('receivedQuantity').isInt({ min: 1 }).withMessage('Jumlah penerimaan minimal 1.'),
  body('receivedDate').isISO8601({ strict: true }).withMessage('Tanggal penerimaan tidak valid.'),
  body('supplierName').optional({ checkFalsy: true }).trim().isLength({ max: 190 }),
  body('purchaseReference').optional({ checkFalsy: true }).trim().isLength({ max: 190 }),
  body('note').optional({ checkFalsy: true }).trim(),
];

module.exports = {
  receivingRules,
};
