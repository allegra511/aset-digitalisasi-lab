const { requireAuth, redirectIfAuthenticated, requireRole } = require('./auth.middleware');
const { notFound, errorHandler } = require('./error.middleware');
const setLocals = require('./set-locals.middleware');

module.exports = {
  requireAuth,
  redirectIfAuthenticated,
  requireRole,
  notFound,
  errorHandler,
  setLocals,
};
