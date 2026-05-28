const appConfig = require('../../config/app');
const constants = require('../shared/constants');
const { consumeFlash, formatDate, formatDateTime } = require('../shared/helpers');

function setLocals(req, res, next) {
  res.locals.appName = appConfig.name;
  res.locals.currentUser = req.session?.user || null;
  res.locals.currentPath = req.path;
  res.locals.flashMessages = consumeFlash(req);
  res.locals.constants = constants;
  res.locals.formatDate = formatDate;
  res.locals.formatDateTime = formatDateTime;

  next();
}

module.exports = setLocals;
