const auditService = require('./audit.service');
const { asyncHandler, buildPaginationMeta, getPagination } = require('../../shared/helpers');

function jsonBlock(value) {
  if (!value) {
    return '-';
  }

  return JSON.stringify(value, null, 2);
}

const index = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const filters = {
    search: req.query.search || '',
    action: req.query.action || '',
    entity: req.query.entity || '',
    userId: req.query.userId || '',
    dateFrom: req.query.dateFrom || '',
    dateTo: req.query.dateTo || '',
  };

  const [result, users] = await Promise.all([
    auditService.listAuditLogs({ ...filters, ...pagination }),
    auditService.listAuditUsers(),
  ]);

  res.render('audit/index', {
    title: 'Audit Logs',
    logs: result.rows,
    users,
    filters,
    pagination: buildPaginationMeta({ ...pagination, total: result.total }),
  });
});

const detail = asyncHandler(async (req, res, next) => {
  const log = await auditService.getAuditLogById(Number(req.params.id));

  if (!log) {
    return next();
  }

  res.render('audit/detail', {
    title: 'Detail Audit Log',
    log,
    beforeData: jsonBlock(log.before_data),
    afterData: jsonBlock(log.after_data),
  });
});

module.exports = {
  index,
  detail,
};
