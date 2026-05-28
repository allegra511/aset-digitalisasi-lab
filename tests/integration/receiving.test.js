const request = require('supertest');

jest.mock('../../src/modules/auth/auth.service', () => {
  class AuthError extends Error {}

  return {
    AuthError,
    login: jest.fn(),
    logout: jest.fn(),
  };
});

jest.mock('../../src/modules/receiving/receiving.service', () => {
  class ReceivingError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'ReceivingError';
      this.code = code;
    }
  }

  return {
    ReceivingError,
    listReceivableItems: jest.fn(),
    getReceivableItem: jest.fn(),
    listReceivingRecords: jest.fn(),
    createReceivingRecord: jest.fn(),
  };
});

const app = require('../../app');
const authService = require('../../src/modules/auth/auth.service');
const receivingService = require('../../src/modules/receiving/receiving.service');

const stafAdmin = {
  id: 4,
  fullName: 'Staf Admin',
  email: 'adminlab@example.test',
  username: 'stafadmin',
  roleId: 4,
  roleName: 'staf_administrasi',
  roleLabel: 'Staf Administrasi',
};

const kepalaLab = {
  ...stafAdmin,
  id: 2,
  roleName: 'kepala_laboratorium',
  roleLabel: 'Kepala Laboratorium',
};

const receivableItem = {
  id: 10,
  name: 'Mikroskop',
  item_type: 'asset',
  draft_title: 'Pengadaan 2026',
  quantity_approved: 5,
  received_quantity: 2,
  remaining_quantity: 3,
  receiving_status: 'partially_received',
};

async function loginAs(user) {
  authService.login.mockResolvedValueOnce(user);
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ identifier: user.username, password: 'password123' });
  return agent;
}

describe('Receiving module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    receivingService.listReceivingRecords.mockResolvedValue([]);
  });

  it('renders receivable item list for staf administrasi', async () => {
    receivingService.listReceivableItems.mockResolvedValue({ rows: [receivableItem], total: 1 });
    const agent = await loginAs(stafAdmin);

    const response = await agent.get('/receiving');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Penerimaan Barang');
    expect(response.text).toContain('Mikroskop');
    expect(response.text).toContain('3');
  });

  it('rejects non staf administrasi from receiving routes', async () => {
    const agent = await loginAs(kepalaLab);

    const response = await agent.get('/receiving');

    expect(response.status).toBe(403);
  });

  it('renders receiving form with remaining quantity', async () => {
    receivingService.getReceivableItem.mockResolvedValue(receivableItem);
    const agent = await loginAs(stafAdmin);

    const response = await agent.get('/receiving/items/10/receive');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Catat Penerimaan');
    expect(response.text).toContain('Sisa');
  });

  it('creates valid receiving record', async () => {
    receivingService.getReceivableItem.mockResolvedValue(receivableItem);
    receivingService.createReceivingRecord.mockResolvedValue(30);
    const agent = await loginAs(stafAdmin);

    const response = await agent.post('/receiving/items/10/receive').type('form').send({
      receivedQuantity: '3',
      receivedDate: '2026-05-22',
      supplierName: 'Supplier A',
      purchaseReference: 'PO-001',
      note: '',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/receiving');
    expect(receivingService.createReceivingRecord).toHaveBeenCalledWith(10, expect.any(Object), expect.any(Object), expect.any(Object));
  });

  it('shows validation error for invalid quantity', async () => {
    receivingService.getReceivableItem.mockResolvedValue(receivableItem);
    const agent = await loginAs(stafAdmin);

    const response = await agent.post('/receiving/items/10/receive').type('form').send({
      receivedQuantity: '0',
      receivedDate: '2026-05-22',
    });

    expect(response.status).toBe(422);
    expect(response.text).toContain('Jumlah penerimaan minimal 1.');
  });

  it('redirects with flash when over receiving is rejected by service', async () => {
    receivingService.getReceivableItem.mockResolvedValue(receivableItem);
    receivingService.createReceivingRecord.mockRejectedValue(
      new receivingService.ReceivingError('Jumlah diterima tidak boleh melebihi sisa quantity approved.', 'OVER_RECEIVE')
    );
    const agent = await loginAs(stafAdmin);

    const response = await agent.post('/receiving/items/10/receive').type('form').send({
      receivedQuantity: '4',
      receivedDate: '2026-05-22',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/receiving/items/10/receive');
  });
});
