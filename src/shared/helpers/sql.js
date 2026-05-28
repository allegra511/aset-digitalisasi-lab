function toSafeLimit(value, fallback = 10, max = 100) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function toSafeOffset(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function limitOffsetClause(limit, offset) {
  return `LIMIT ${toSafeLimit(limit)} OFFSET ${toSafeOffset(offset)}`;
}

module.exports = {
  toSafeLimit,
  toSafeOffset,
  limitOffsetClause,
};
