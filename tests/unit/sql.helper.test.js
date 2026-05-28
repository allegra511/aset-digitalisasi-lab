const { toSafeLimit, toSafeOffset, limitOffsetClause } = require('../../src/shared/helpers/sql');

describe('SQL helper', () => {
  it('builds a numeric LIMIT/OFFSET clause for MySQL pagination', () => {
    expect(limitOffsetClause(25, 50)).toBe('LIMIT 25 OFFSET 50');
  });

  it('clamps invalid limit and offset values', () => {
    expect(toSafeLimit('abc')).toBe(10);
    expect(toSafeLimit(999)).toBe(100);
    expect(toSafeOffset(-5)).toBe(0);
  });

  it('parses string numbers before building the clause', () => {
    expect(limitOffsetClause('20', '40')).toBe('LIMIT 20 OFFSET 40');
  });
});
