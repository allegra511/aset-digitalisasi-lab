jest.mock('../../config/database', () => ({
  pool: {},
}));

jest.mock('../../src/modules/audit/audit.service', () => ({
  logAction: jest.fn(),
}));

const { calculateStatus, ConsumableError } = require('../../src/modules/consumables/consumables.service');

describe('Consumables service helpers', () => {
  it('marks stock as out_of_stock when stock is zero', () => {
    expect(calculateStatus(0, 5)).toBe('out_of_stock');
  });

  it('marks stock as low_stock when stock is at or below minimum', () => {
    expect(calculateStatus(3, 3)).toBe('low_stock');
    expect(calculateStatus(2, 3)).toBe('low_stock');
  });

  it('marks stock as available when stock is above minimum', () => {
    expect(calculateStatus(4, 3)).toBe('available');
  });

  it('keeps ConsumableError code for service failures', () => {
    const error = new ConsumableError('Stok BHP tidak boleh negatif.', 'NEGATIVE_STOCK');

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('NEGATIVE_STOCK');
  });
});
