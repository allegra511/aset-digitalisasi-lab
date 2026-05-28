const request = require('supertest');

jest.mock('../../src/modules/auth/auth.service', () => {
  class AuthError extends Error {}

  return {
    AuthError,
    login: jest.fn(),
    logout: jest.fn(),
  };
});

jest.mock('../../src/modules/consumables/consumables.service', () => {
  class ConsumableError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'ConsumableError';
      this.code = code;
    }
  }

  return {
    ConsumableError,
    listConsumables: jest.fn(),
    listRooms: jest.fn(),
    getConsumableById: jest.fn(),
    listTransactions: jest.fn(),
    createConsumable: jest.fn(),
    updateConsumable: jest.fn(),
    createStockTransaction: jest.fn(),
    getReceivingConsumableRecord: jest.fn(),
    stockInFromReceiving: jest.fn(),
  };
});

const app = require('../../app');
const authService = require('../../src/modules/auth/auth.service');
const consumablesService = require('../../src/modules/consumables/consumables.service');

const stafAdmin = {
  id: 4,
  fullName: 'Staf Admin',
  email: 'adminlab@example.test',
  username: 'stafadmin',
  roleId: 4,
  roleName: 'staf_administrasi',
  roleLabel: 'Staf Administrasi',
};

const stafLab = {
  ...stafAdmin,
  id: 5,
  roleName: 'staf_laboratorium',
  roleLabel: 'Staf Laboratorium',
};

const kepalaLab = {
  ...stafAdmin,
  id: 2,
  roleName: 'kepala_laboratorium',
  roleLabel: 'Kepala Laboratorium',
};

const consumable = {
  id: 1,
  name: 'Sarung Tangan',
  specification: 'Latex',
  unit: 'box',
  current_stock: 2,
  minimum_stock: 5,
  status: 'low_stock',
  room_id: 1,
  room_name: 'Laboratorium 1',
};

const receivingRecord = {
  id: 30,
  procurement_item_id: 10,
  item_name: 'Alkohol 70%',
  item_type: 'consumable',
  specification: '1 liter',
  room_id: 1,
  room_name: 'Laboratorium 1',
  received_quantity: 4,
};

async function loginAs(user) {
  authService.login.mockResolvedValueOnce(user);
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ identifier: user.username, password: 'password123' });
  return agent;
}

describe('Consumables module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    consumablesService.listRooms.mockResolvedValue([{ id: 1, code: 'LAB-1', name: 'Laboratorium 1' }]);
    consumablesService.listTransactions.mockResolvedValue([]);
  });

  it('renders consumable list for staf administrasi and shows low stock badge', async () => {
    consumablesService.listConsumables.mockResolvedValue({ rows: [consumable], total: 1 });
    const agent = await loginAs(stafAdmin);

    const response = await agent.get('/consumables');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Barang Habis Pakai');
    expect(response.text).toContain('Sarung Tangan');
    expect(response.text).toContain('low_stock');
  });

  it('renders consumable list for staf laboratorium', async () => {
    consumablesService.listConsumables.mockResolvedValue({ rows: [], total: 0 });
    const agent = await loginAs(stafLab);

    const response = await agent.get('/consumables');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Belum ada BHP');
  });

  it('rejects other roles from consumable mutation pages', async () => {
    const agent = await loginAs(kepalaLab);

    const response = await agent.get('/consumables/new');

    expect(response.status).toBe(403);
  });

  it('creates manual stock transaction', async () => {
    consumablesService.getConsumableById.mockResolvedValue(consumable);
    consumablesService.createStockTransaction.mockResolvedValue(12);
    const agent = await loginAs(stafLab);

    const response = await agent.post('/consumables/1/transactions').type('form').send({
      transactionType: 'OUT',
      quantity: '1',
      note: 'Pemakaian praktikum',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/consumables/1');
    expect(consumablesService.createStockTransaction).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ transactionType: 'OUT', quantity: '1' }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('redirects with flash when stock out exceeds available stock', async () => {
    consumablesService.getConsumableById.mockResolvedValue(consumable);
    consumablesService.createStockTransaction.mockRejectedValue(
      new consumablesService.ConsumableError('Stok BHP tidak boleh negatif.', 'NEGATIVE_STOCK')
    );
    const agent = await loginAs(stafLab);

    const response = await agent.post('/consumables/1/transactions').type('form').send({
      transactionType: 'OUT',
      quantity: '99',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/consumables/1/transactions/new');
  });

  it('renders stock-in form from consumable receiving record', async () => {
    consumablesService.getReceivingConsumableRecord.mockResolvedValue(receivingRecord);
    const agent = await loginAs(stafAdmin);

    const response = await agent.get('/consumables/receiving/30/stock-in');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Stock In Receiving');
    expect(response.text).toContain('Alkohol 70%');
  });

  it('stocks in receiving consumable and redirects to detail', async () => {
    consumablesService.getReceivingConsumableRecord.mockResolvedValue(receivingRecord);
    consumablesService.stockInFromReceiving.mockResolvedValue(1);
    const agent = await loginAs(stafAdmin);

    const response = await agent.post('/consumables/receiving/30/stock-in').type('form').send({
      name: 'Alkohol 70%',
      unit: 'botol',
      minimumStock: '2',
      roomId: '1',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/consumables/1');
  });

  it('rejects duplicate stock-in from the same receiving record', async () => {
    consumablesService.getReceivingConsumableRecord.mockResolvedValue(receivingRecord);
    consumablesService.stockInFromReceiving.mockRejectedValue(
      new consumablesService.ConsumableError('Receiving record ini sudah pernah dimasukkan ke stok BHP.', 'RECEIVING_ALREADY_STOCKED')
    );
    const agent = await loginAs(stafAdmin);

    const response = await agent.post('/consumables/receiving/30/stock-in').type('form').send({
      name: 'Alkohol 70%',
      unit: 'botol',
      minimumStock: '2',
      roomId: '1',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/consumables/receiving/30/stock-in');
  });
});
