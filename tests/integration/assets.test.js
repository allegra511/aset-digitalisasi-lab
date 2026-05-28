const request = require('supertest');

jest.mock('../../src/modules/auth/auth.service', () => {
  class AuthError extends Error {}

  return {
    AuthError,
    login: jest.fn(),
    logout: jest.fn(),
  };
});

jest.mock('../../src/modules/assets/assets.service', () => {
  class AssetError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'AssetError';
      this.code = code;
    }
  }

  return {
    AssetError,
    listAssets: jest.fn(),
    listRooms: jest.fn(),
    getAssetById: jest.fn(),
    getStatusHistory: jest.fn(),
    getReplacementRelations: jest.fn(),
    listReplacementCandidates: jest.fn(),
    isInventoryNumberTaken: jest.fn(),
    getReceivingRecordForAssetCreation: jest.fn(),
    createAssetFromReceiving: jest.fn(),
    softDeleteAsset: jest.fn(),
    replaceAsset: jest.fn(),
  };
});

const app = require('../../app');
const authService = require('../../src/modules/auth/auth.service');
const assetsService = require('../../src/modules/assets/assets.service');

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

const receivingRecord = {
  id: 30,
  procurement_item_id: 10,
  item_name: 'Mikroskop',
  item_type: 'asset',
  specification: 'Digital',
  room_id: 1,
  room_name: 'Laboratorium 1',
  received_quantity: 2,
  created_assets: 1,
  remaining_assets: 1,
  received_date: new Date('2026-05-22T00:00:00Z'),
};

async function loginAs(user) {
  authService.login.mockResolvedValueOnce(user);
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ identifier: user.username, password: 'password123' });
  return agent;
}

describe('Assets module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    assetsService.listRooms.mockResolvedValue([{ id: 1, code: 'LAB-1', name: 'Laboratorium 1' }]);
    assetsService.getReplacementRelations.mockResolvedValue({ replacedBy: [], replaces: [] });
    assetsService.listReplacementCandidates.mockResolvedValue([
      { id: 2, inventory_number: 'INV-002', name: 'Mikroskop Baru', status: 'active', asset_condition: 'good' },
    ]);
  });

  it('renders asset list for authenticated users', async () => {
    assetsService.listAssets.mockResolvedValue({
      rows: [{ id: 1, inventory_number: 'INV-001', name: 'Mikroskop', room_name: 'Laboratorium 1', status: 'active', asset_condition: 'good' }],
      total: 1,
    });
    const agent = await loginAs(stafLab);

    const response = await agent.get('/assets');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Daftar Aset');
    expect(response.text).toContain('INV-001');
  });

  it('renders asset detail with QR and status history', async () => {
    assetsService.getAssetById.mockResolvedValue({
      id: 1,
      inventory_number: 'INV-001',
      name: 'Mikroskop',
      room_name: 'Laboratorium 1',
      status: 'active',
      asset_condition: 'good',
      acquisition_date: new Date('2026-05-22T00:00:00Z'),
      qr_code_path: '/qrcodes/INV-001.png',
    });
    assetsService.getStatusHistory.mockResolvedValue([
      { changed_at: new Date('2026-05-22T00:00:00Z'), previous_status: null, new_status: 'active', previous_condition: null, new_condition: 'good', changed_by_name: 'Staf Admin', note: 'Aset dibuat.' },
    ]);
    const agent = await loginAs(stafLab);

    const response = await agent.get('/assets/1');

    expect(response.status).toBe(200);
    expect(response.text).toContain('INV-001');
    expect(response.text).toContain('/qrcodes/INV-001.png');
    expect(response.text).toContain('Riwayat Status');
  });

  it('renders replacement relation on asset detail', async () => {
    assetsService.getAssetById.mockResolvedValue({
      id: 1,
      inventory_number: 'INV-001',
      name: 'Mikroskop Lama',
      room_name: 'Laboratorium 1',
      status: 'replaced',
      asset_condition: 'fair',
      acquisition_date: new Date('2026-05-22T00:00:00Z'),
      qr_code_path: null,
    });
    assetsService.getStatusHistory.mockResolvedValue([]);
    assetsService.getReplacementRelations.mockResolvedValue({
      replacedBy: [{ new_asset_id: 2, inventory_number: 'INV-002', name: 'Mikroskop Baru', replacement_date: new Date('2026-05-22T00:00:00Z'), reason: 'Rusak berat' }],
      replaces: [],
    });
    const agent = await loginAs(stafLab);

    const response = await agent.get('/assets/1');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Relasi Replacement');
    expect(response.text).toContain('INV-002');
  });

  it('rejects non staf administrasi from asset creation form', async () => {
    const agent = await loginAs(stafLab);

    const response = await agent.get('/assets/receiving/30/new');

    expect(response.status).toBe(403);
  });

  it('renders soft delete form for staf laboratorium', async () => {
    assetsService.getAssetById.mockResolvedValue({
      id: 1,
      inventory_number: 'INV-001',
      name: 'Mikroskop',
      status: 'active',
    });
    const agent = await loginAs(stafLab);

    const response = await agent.get('/assets/1/delete');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Soft Delete Aset');
    expect(response.text).toContain('Mikroskop');
  });

  it('rejects non staf laboratorium from soft delete', async () => {
    const agent = await loginAs(stafAdmin);

    const response = await agent.get('/assets/1/delete');

    expect(response.status).toBe(403);
  });

  it('soft deletes an asset with reason', async () => {
    assetsService.getAssetById.mockResolvedValue({
      id: 1,
      inventory_number: 'INV-001',
      name: 'Mikroskop',
      status: 'active',
    });
    const agent = await loginAs(stafLab);

    const response = await agent.post('/assets/1/delete').type('form').send({
      reason: 'Rusak dan tidak layak pakai',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/assets/1');
    expect(assetsService.softDeleteAsset).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ reason: 'Rusak dan tidak layak pakai' }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('renders replacement form for staf laboratorium', async () => {
    assetsService.getAssetById.mockResolvedValue({
      id: 1,
      inventory_number: 'INV-001',
      name: 'Mikroskop Lama',
      status: 'active',
    });
    const agent = await loginAs(stafLab);

    const response = await agent.get('/assets/1/replacements/new');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Replacement Aset');
    expect(response.text).toContain('INV-002');
  });

  it('rejects replacement with the same asset', async () => {
    assetsService.getAssetById.mockResolvedValue({
      id: 1,
      inventory_number: 'INV-001',
      name: 'Mikroskop Lama',
      status: 'active',
    });
    const agent = await loginAs(stafLab);

    const response = await agent.post('/assets/1/replacements').type('form').send({
      newAssetId: '1',
      replacementDate: '2026-05-22',
      reason: 'Penggantian unit',
    });

    expect(response.status).toBe(422);
    expect(response.text).toContain('Aset pengganti tidak boleh sama dengan aset lama.');
  });

  it('creates asset replacement relation', async () => {
    assetsService.getAssetById.mockResolvedValue({
      id: 1,
      inventory_number: 'INV-001',
      name: 'Mikroskop Lama',
      status: 'active',
    });
    assetsService.replaceAsset.mockResolvedValue(12);
    const agent = await loginAs(stafLab);

    const response = await agent.post('/assets/1/replacements').type('form').send({
      newAssetId: '2',
      replacementDate: '2026-05-22',
      reason: 'Penggantian unit',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/assets/1');
    expect(assetsService.replaceAsset).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ newAssetId: '2', replacementDate: '2026-05-22' }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('renders asset creation form from receiving record', async () => {
    assetsService.getReceivingRecordForAssetCreation.mockResolvedValue(receivingRecord);
    const agent = await loginAs(stafAdmin);

    const response = await agent.get('/assets/receiving/30/new');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Buat Aset dari Penerimaan');
    expect(response.text).toContain('Mikroskop');
  });

  it('creates asset with unique inventory number', async () => {
    assetsService.getReceivingRecordForAssetCreation.mockResolvedValue(receivingRecord);
    assetsService.isInventoryNumberTaken.mockResolvedValue(false);
    assetsService.createAssetFromReceiving.mockResolvedValue(1);
    const agent = await loginAs(stafAdmin);

    const response = await agent.post('/assets/receiving/30').type('form').send({
      inventoryNumber: 'INV-001',
      name: 'Mikroskop',
      specification: 'Digital',
      roomId: '1',
      assetCondition: 'good',
      acquisitionDate: '2026-05-22',
      photoPath: '',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/assets/1');
    expect(assetsService.createAssetFromReceiving).toHaveBeenCalledWith(30, expect.any(Object), expect.any(Object), expect.any(Object));
  });

  it('shows validation error for duplicate inventory number', async () => {
    assetsService.getReceivingRecordForAssetCreation.mockResolvedValue(receivingRecord);
    assetsService.isInventoryNumberTaken.mockResolvedValue(true);
    const agent = await loginAs(stafAdmin);

    const response = await agent.post('/assets/receiving/30').type('form').send({
      inventoryNumber: 'INV-001',
      name: 'Mikroskop',
      roomId: '1',
      assetCondition: 'good',
      acquisitionDate: '2026-05-22',
    });

    expect(response.status).toBe(422);
    expect(response.text).toContain('Nomor inventaris sudah digunakan.');
  });
});
