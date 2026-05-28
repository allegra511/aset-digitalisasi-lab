const appConfig = require('../../config/app');

function wantsJson(req) {
  return req.xhr || req.accepts(['html', 'json']) === 'json' || req.path.startsWith('/api/');
}

function notFound(req, res) {
  if (wantsJson(req)) {
    return res.status(404).json({
      status: 'error',
      message: 'Halaman tidak ditemukan.',
    });
  }

  return res.status(404).render('errors/404', {
    title: 'Halaman Tidak Ditemukan',
  });
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const isProduction = appConfig.env === 'production';
  const message = isProduction && statusCode >= 500 ? 'Terjadi kesalahan server.' : err.message;

  if (appConfig.env !== 'test') {
    console.error(err);
  }

  if (wantsJson(req)) {
    return res.status(statusCode).json({
      status: 'error',
      message,
    });
  }

  return res.status(statusCode).render('errors/error', {
    title: statusCode === 403 ? 'Akses Ditolak' : 'Terjadi Kesalahan',
    statusCode,
    message,
  });
}

module.exports = {
  notFound,
  errorHandler,
};
