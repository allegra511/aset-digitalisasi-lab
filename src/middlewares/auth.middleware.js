function requireAuth(req, res, next) {
  if (req.session?.user) {
    return next();
  }

  if (req.xhr || req.accepts(['html', 'json']) === 'json' || req.path.startsWith('/api/')) {
    return res.status(401).json({
      status: 'error',
      message: 'Anda harus login terlebih dahulu.',
    });
  }

  return res.redirect('/auth/login');
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session?.user) {
    return res.redirect('/dashboard');
  }

  return next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const roleName = req.session?.user?.roleName;

    if (roleName && allowedRoles.includes(roleName)) {
      return next();
    }

    const error = new Error('Anda tidak memiliki akses ke halaman ini.');
    error.statusCode = 403;
    return next(error);
  };
}

module.exports = {
  requireAuth,
  redirectIfAuthenticated,
  requireRole,
};
