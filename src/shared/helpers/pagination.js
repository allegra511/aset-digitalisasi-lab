function getPagination(query = {}, defaults = {}) {
  const defaultPage = defaults.page || 1;
  const defaultLimit = defaults.limit || 10;
  const maxLimit = defaults.maxLimit || 100;

  const page = Math.max(Number.parseInt(query.page, 10) || defaultPage, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset,
  };
}

function buildPaginationMeta({ page, limit, total }) {
  const totalItems = Number(total || 0);
  const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

module.exports = {
  getPagination,
  buildPaginationMeta,
};
