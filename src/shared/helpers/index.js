const asyncHandler = require('./async-handler');
const { formatDate, formatDateTime } = require('./date');
const { getDashboardPathByRole } = require('./dashboard');
const { addFlash, consumeFlash } = require('./flash');
const { getPagination, buildPaginationMeta } = require('./pagination');
const { toSafeLimit, toSafeOffset, limitOffsetClause } = require('./sql');

module.exports = {
  asyncHandler,
  formatDate,
  formatDateTime,
  getDashboardPathByRole,
  addFlash,
  consumeFlash,
  getPagination,
  buildPaginationMeta,
  toSafeLimit,
  toSafeOffset,
  limitOffsetClause,
};
