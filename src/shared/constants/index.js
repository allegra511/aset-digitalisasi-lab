const { ROLES, ROLE_LABELS } = require('./roles');
const statuses = require('./statuses');

module.exports = {
  ROLES,
  ROLE_LABELS,
  ...statuses,
};
