const { validationResult } = require('express-validator');
const appConfig = require('../../../config/app');
const authService = require('./auth.service');
const { addFlash, asyncHandler, getDashboardPathByRole } = require('../../shared/helpers');

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
}

function mapValidationErrors(result) {
  return result.array().reduce((errors, error) => {
    errors[error.path] = error.msg;
    return errors;
  }, {});
}

function showLogin(req, res) {
  res.render('auth/login', {
    title: 'Login',
    formData: {},
    errors: {},
  });
}

const login = asyncHandler(async (req, res) => {
  const result = validationResult(req);
  const formData = {
    identifier: req.body.identifier || '',
  };

  if (!result.isEmpty()) {
    return res.status(422).render('auth/login', {
      title: 'Login',
      formData,
      errors: mapValidationErrors(result),
    });
  }

  try {
    const user = await authService.login({
      identifier: req.body.identifier.trim(),
      password: req.body.password,
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent') || null,
    });

    await new Promise((resolve, reject) => {
      req.session.regenerate((regenerateError) => {
        if (regenerateError) {
          reject(regenerateError);
          return;
        }

        resolve();
      });
    });

    req.session.user = user;
    addFlash(req, 'success', 'Login berhasil.');
    return res.redirect(getDashboardPathByRole(user.roleName));
  } catch (error) {
    if (error instanceof authService.AuthError) {
      return res.status(401).render('auth/login', {
        title: 'Login',
        formData,
        errors: {},
        flashMessages: [{ type: 'error', message: error.message }],
      });
    }

    throw error;
  }
});

const logout = asyncHandler(async (req, res) => {
  const user = req.session?.user || null;

  await authService.logout({
    user,
    ipAddress: getClientIp(req),
    userAgent: req.get('user-agent') || null,
  });

  await new Promise((resolve, reject) => {
    req.session.destroy((destroyError) => {
      if (destroyError) {
        reject(destroyError);
        return;
      }

      resolve();
    });
  });

  res.clearCookie(appConfig.session.name);
  return res.redirect('/auth/login');
});

module.exports = {
  showLogin,
  login,
  logout,
};
