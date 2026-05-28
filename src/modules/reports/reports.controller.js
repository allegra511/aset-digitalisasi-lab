const ExcelJS = require('exceljs');
const reportsService = require('./reports.service');
const { asyncHandler, buildPaginationMeta, formatDate, formatDateTime, getPagination } = require('../../shared/helpers');
const {
  ASSET_STATUSES,
  CONSUMABLE_STATUSES,
  DRAFT_STATUSES,
  PROCUREMENT_ITEM_STATUSES,
  RECEIVING_STATUSES,
} = require('../../shared/constants');

const REPORT_STATUS_OPTIONS = {
  assets: Object.values(ASSET_STATUSES),
  consumables: Object.values(CONSUMABLE_STATUSES),
  maintenance: Object.values(ASSET_STATUSES),
  procurement: Object.values(DRAFT_STATUSES),
};

const CONDITION_OPTIONS = ['good', 'fair', 'damaged'];
const ITEM_TYPE_OPTIONS = ['asset', 'consumable'];

function currentDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeFilters(query = {}) {
  return {
    search: query.search || '',
    roomId: query.roomId || '',
    status: query.status || '',
    condition: query.condition || '',
    year: query.year || '',
    itemType: query.itemType || '',
    dateFrom: query.dateFrom || '',
    dateTo: query.dateTo || '',
  };
}

function buildExportUrl(reportType, query, format) {
  const params = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (key !== 'page' && value !== undefined && value !== null && value !== '') {
      params.set(key, value);
    }
  });

  params.set('format', format);
  return `/reports/${reportType}/export?${params.toString()}`;
}

function buildPageUrl(reportType, query, page) {
  const params = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value);
    }
  });

  params.set('page', page);
  return `/reports/${reportType}?${params.toString()}`;
}

function formatReportValue(value, column = {}) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (column.type === 'date') {
    return formatDate(value);
  }

  if (column.type === 'datetime') {
    return formatDateTime(value);
  }

  if (column.type === 'currency') {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  return String(value);
}

function csvEscape(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function buildCsv(columns, rows) {
  const header = columns.map((column) => csvEscape(column.label)).join(',');
  const body = rows.map((row) => (
    columns.map((column) => {
      const value = formatReportValue(row[column.key], column);
      return csvEscape(value === '-' ? '' : value);
    }).join(',')
  ));

  return [header, ...body].join('\r\n');
}

async function buildWorkbook(definition, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Aset Digitalisasi Lab';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(definition.title.slice(0, 31));
  worksheet.columns = definition.columns.map((column) => ({
    header: column.label,
    key: column.key,
    width: Math.max(column.label.length + 4, 18),
  }));

  rows.forEach((row) => {
    const formatted = {};
    definition.columns.forEach((column) => {
      const value = formatReportValue(row[column.key], column);
      formatted[column.key] = value === '-' ? '' : value;
    });
    worksheet.addRow(formatted);
  });

  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  return workbook.xlsx.writeBuffer();
}

const index = asyncHandler(async (req, res) => {
  res.render('reports/index', {
    title: 'Laporan',
    reports: reportsService.listReportTypes(),
  });
});

const showReport = asyncHandler(async (req, res, next) => {
  const { reportType } = req.params;
  const definition = reportsService.getReportDefinition(reportType);

  if (!definition) {
    return next();
  }

  const pagination = getPagination(req.query);
  const filters = normalizeFilters(req.query);
  const [result, rooms] = await Promise.all([
    reportsService.listReportRows(reportType, filters, pagination),
    reportsService.listRooms(),
  ]);
  const paginationMeta = buildPaginationMeta({ ...pagination, total: result.total });

  res.render('reports/report', {
    title: definition.title,
    reportType,
    definition,
    rows: result.rows,
    filters,
    rooms,
    statusOptions: REPORT_STATUS_OPTIONS[reportType] || [
      ...Object.values(PROCUREMENT_ITEM_STATUSES),
      ...Object.values(RECEIVING_STATUSES),
    ],
    conditionOptions: CONDITION_OPTIONS,
    itemTypeOptions: ITEM_TYPE_OPTIONS,
    pagination: paginationMeta,
    previousPageUrl: buildPageUrl(reportType, req.query, Math.max(paginationMeta.page - 1, 1)),
    nextPageUrl: buildPageUrl(reportType, req.query, Math.min(paginationMeta.page + 1, paginationMeta.totalPages)),
    excelExportUrl: buildExportUrl(reportType, req.query, 'xlsx'),
    csvExportUrl: buildExportUrl(reportType, req.query, 'csv'),
    formatReportValue,
  });
});

const exportReport = asyncHandler(async (req, res, next) => {
  const { reportType } = req.params;
  const format = req.query.format || 'xlsx';
  const definition = reportsService.getReportDefinition(reportType);

  if (!definition) {
    return next();
  }

  if (!['xlsx', 'csv'].includes(format)) {
    return res.status(400).send('Format export tidak valid.');
  }

  const filters = normalizeFilters(req.query);
  const rows = await reportsService.listReportExportRows(reportType, filters);
  const filename = `laporan-${reportType}-${currentDateStamp()}.${format}`;

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buildCsv(definition.columns, rows));
  }

  const buffer = await buildWorkbook(definition, rows);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(Buffer.from(buffer));
});

module.exports = {
  index,
  showReport,
  exportReport,
  formatReportValue,
};
