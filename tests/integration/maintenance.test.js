const request = require('supertest');

jest.mock('../../src/modules/auth/auth.service', () => {
  class AuthError extends Error {}

  return {
    AuthError,
    login: jest.fn(),
    logout: jest.fn(),
  };
});

jest.mock('../../src/modules/maintenance/maintenance.service', () => {
  class MaintenanceError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'MaintenanceError';
      this.code = code;
    }
  }

  return {
    MaintenanceError,
    listMaintenanceLogs: jest.fn(),
    listAssetsForMaintenance: jest.fn(),
    listAvailableConsumables: jest.fn(),
    getAssetById: jest.fn(),
    getMaintenanceById: jest.fn(),
    getMaintenanceConsumables: jest.fn(),
    createMaintenance: jest.fn(),
  };
});

const app = require('../../app');
const authService = require('../../src/modules/auth/auth.service');
const maintenanceService = require('../../src/modules/maintenance/maintenance.service');

const stafLab = {
  id: 5,
  fullName: 'Staf Lab',
  email: 'staflab@example.test',
  username: 'staflab',
  roleId: 5,
  roleName: 'staf_laboratorium',
  roleLabel: 'Staf Laboratorium',
};

const stafAdmin = {
  ...stafLab,
  id: 4,
  roleName: 'staf_administrasi',
  roleLabel: 'Staf Administrasi',
};

const asset = {
  id: 1,
  inventory_number: 'INV-001',
  name: 'Mikroskop',
  status: 'active',
  asset_condition: 'good',
};

const consumable = {
  id: 1,
  name: 'Sarung Tangan',
  unit: 'box',
  current_stock: 5,
  minimum_stock: 2,
  status: 'available',
};

const maintenanceLog = {
  id: 7,
  asset_id: 1,
  asset_name: 'Mikroskop',
  inventory_number: 'INV-001',
  maintenance_date: new Date('2026-05-22T00:00:00Z'),
  description: 'Kalibrasi lensa',
  condition_before: 'fair',
  condition_after: 'good',
  status_after: 'active',
  cost: 100000,
  performed_by_name: 'Staf Lab',
};

async function loginAs(user) {
  authService.login.mockResolvedValueOnce(user);
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ identifier: user.username, password: 'password123' });
  return agent;
}

describe('Maintenance module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    maintenanceService.listAssetsForMaintenance.mockResolvedValue([asset]);
    maintenanceService.listAvailableConsumables.mockResolvedValue([consumable]);
  });

  it('renders maintenance list for staf laboratorium', async () => {
    maintenanceService.listMaintenanceLogs.mockResolvedValue({ rows: [maintenanceLog], total: 1 });
    const agent = await loginAs(stafLab);

    const response = await agent.get('/maintenance');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Maintenance Aset');
    expect(response.text).toContain('INV-001');
  });

  it('rejects non staf laboratorium from maintenance routes', async () => {
    const agent = await loginAs(stafAdmin);

    const response = await agent.get('/maintenance');

    expect(response.status).toBe(403);
  });

  it('renders create form with assets and available consumables', async () => {
    const agent = await loginAs(stafLab);

    const response = await agent.get('/maintenance/new');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Tambah Maintenance');
    expect(response.text).toContain('Mikroskop');
    expect(response.text).toContain('Sarung Tangan');
  });

  it('creates maintenance without consumables', async () => {
    maintenanceService.createMaintenance.mockResolvedValue(7);
    const agent = await loginAs(stafLab);

    const response = await agent.post('/maintenance').type('form').send({
      assetId: '1',
      maintenanceDate: '2026-05-22',
      description: 'Kalibrasi lensa',
      conditionBefore: 'fair',
      conditionAfter: 'good',
      statusAfter: 'active',
      cost: '100000',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/maintenance/7');
    expect(maintenanceService.createMaintenance).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: '1', consumables: [] }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('passes consumable usage to maintenance service', async () => {
    maintenanceService.createMaintenance.mockResolvedValue(7);
    const agent = await loginAs(stafLab);

    const response = await agent.post('/maintenance').type('form').send({
      assetId: '1',
      maintenanceDate: '2026-05-22',
      description: 'Ganti sarung pelindung',
      conditionBefore: 'fair',
      conditionAfter: 'good',
      statusAfter: 'active',
      cost: '0',
      consumableIds: ['1'],
      consumableQuantities: ['2'],
    });

    expect(response.status).toBe(302);
    expect(maintenanceService.createMaintenance).toHaveBeenCalledWith(
      expect.objectContaining({
        consumables: [expect.objectContaining({ consumableId: '1', quantityUsed: '2' })],
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('redirects with flash when consumable stock is insufficient', async () => {
    maintenanceService.createMaintenance.mockRejectedValue(
      new maintenanceService.MaintenanceError('Stok BHP Sarung Tangan tidak cukup.', 'INSUFFICIENT_STOCK')
    );
    const agent = await loginAs(stafLab);

    const response = await agent.post('/maintenance').type('form').send({
      assetId: '1',
      maintenanceDate: '2026-05-22',
      description: 'Ganti sarung pelindung',
      conditionBefore: 'fair',
      conditionAfter: 'good',
      statusAfter: 'active',
      cost: '0',
      consumableIds: ['1'],
      consumableQuantities: ['99'],
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/maintenance/new');
  });

  it('renders maintenance detail with consumable usage', async () => {
    maintenanceService.getMaintenanceById.mockResolvedValue(maintenanceLog);
    maintenanceService.getMaintenanceConsumables.mockResolvedValue([
      { id: 1, name: 'Sarung Tangan', unit: 'box', quantity_used: 2 },
    ]);
    const agent = await loginAs(stafLab);

    const response = await agent.get('/maintenance/7');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Detail Maintenance');
    expect(response.text).toContain('Sarung Tangan');
  });
});
