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
    calculateStatus: jest.fn(),
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
const consumablesService = require('../../src/modules/consumables/consumables.service');
const maintenanceService = require('../../src/modules/maintenance/maintenance.service');
const assetsService = require('../../src/modules/assets/assets.service');

const stafAdmin = {
  id: 4,
  fullName: 'Staf Admin',
  email: 'stafadmin@example.test',
  username: 'stafadmin',
  roleId: 4,
  roleName: 'staf_administrasi',
  roleLabel: 'Staf Administrasi',
};

const stafLab = {
  id: 5,
  fullName: 'Staf Lab',
  email: 'staflab@example.test',
  username: 'staflab',
  roleId: 5,
  roleName: 'staf_laboratorium',
  roleLabel: 'Staf Laboratorium',
};

const users = new Map([stafAdmin, stafLab].map((user) => [user.username, user]));

async function loginAs(user) {
  authService.login.mockResolvedValueOnce(user);
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ identifier: user.username, password: 'password123' });
  return agent;
}

function calculateStatus(stock, minimumStock) {
  if (stock <= 0) {
    return 'out_of_stock';
  }

  if (stock <= minimumStock) {
    return 'low_stock';
  }

  return 'available';
}

function createWorkflowState() {
  return {
    nextTransactionId: 1,
    nextMaintenanceId: 7,
    asset: {
      id: 1,
      inventory_number: 'INV-001',
      name: 'Mikroskop',
      status: 'active',
      asset_condition: 'good',
      room_name: 'Laboratorium 1',
      acquisition_date: new Date('2026-05-22T00:00:00Z'),
    },
    consumable: {
      id: 1,
      name: 'Sarung Tangan',
      specification: 'Latex',
      unit: 'box',
      current_stock: 0,
      minimum_stock: 2,
      status: 'out_of_stock',
      room_id: 1,
      room_name: 'Laboratorium 1',
    },
    receivingRecord: {
      id: 50,
      item_name: 'Sarung Tangan',
      item_type: 'consumable',
      specification: 'Latex',
      room_id: 1,
      room_name: 'Laboratorium 1',
      received_quantity: 5,
    },
    transactions: [],
    maintenanceLogs: [],
    maintenanceConsumables: [],
    statusHistories: [],
  };
}

describe('Workflow: stock, maintenance, and asset history', () => {
  let state;

  beforeEach(() => {
    jest.clearAllMocks();
    state = createWorkflowState();

    authService.login.mockImplementation(({ identifier }) => Promise.resolve(users.get(identifier)));

    consumablesService.calculateStatus.mockImplementation(calculateStatus);
    consumablesService.listRooms.mockResolvedValue([{ id: 1, code: 'LAB-1', name: 'Laboratorium 1' }]);
    consumablesService.getConsumableById.mockImplementation(async (id) => (
      Number(id) === state.consumable.id ? state.consumable : null
    ));
    consumablesService.listTransactions.mockImplementation(async () => state.transactions);
    consumablesService.getReceivingConsumableRecord.mockImplementation(async (id) => (
      Number(id) === state.receivingRecord.id ? state.receivingRecord : null
    ));
    consumablesService.stockInFromReceiving.mockImplementation(async (receivingId, data) => {
      if (Number(receivingId) !== state.receivingRecord.id) {
        throw new consumablesService.ConsumableError('Data penerimaan tidak ditemukan.', 'RECEIVING_NOT_FOUND');
      }
      const stockBefore = state.consumable.current_stock;
      const stockAfter = stockBefore + state.receivingRecord.received_quantity;
      state.consumable.current_stock = stockAfter;
      state.consumable.status = calculateStatus(stockAfter, state.consumable.minimum_stock);
      state.transactions.push({
        id: state.nextTransactionId++,
        transaction_type: 'IN',
        quantity: state.receivingRecord.received_quantity,
        stock_before: stockBefore,
        stock_after: stockAfter,
        note: data.note,
      });
      return state.consumable.id;
    });
    consumablesService.createStockTransaction.mockImplementation(async (id, data) => {
      const quantity = Number(data.quantity);
      const stockBefore = state.consumable.current_stock;
      const stockAfter = data.transactionType === 'OUT' ? stockBefore - quantity : stockBefore + quantity;

      if (stockAfter < 0) {
        throw new consumablesService.ConsumableError('Stok BHP tidak boleh negatif.', 'NEGATIVE_STOCK');
      }

      state.consumable.current_stock = stockAfter;
      state.consumable.status = calculateStatus(stockAfter, state.consumable.minimum_stock);
      state.transactions.push({
        id: state.nextTransactionId++,
        transaction_type: data.transactionType,
        quantity,
        stock_before: stockBefore,
        stock_after: stockAfter,
      });
      return state.nextTransactionId - 1;
    });

    maintenanceService.listAssetsForMaintenance.mockImplementation(async () => [state.asset]);
    maintenanceService.listAvailableConsumables.mockImplementation(async () => (
      state.consumable.current_stock > 0 ? [state.consumable] : []
    ));
    maintenanceService.getMaintenanceById.mockImplementation(async (id) => (
      state.maintenanceLogs.find((log) => log.id === Number(id)) || null
    ));
    maintenanceService.getMaintenanceConsumables.mockImplementation(async (id) => (
      state.maintenanceConsumables.filter((item) => item.maintenance_log_id === Number(id))
    ));
    maintenanceService.createMaintenance.mockImplementation(async (data, actor) => {
      const usage = (data.consumables || [])
        .filter((item) => item.consumableId && Number(item.quantityUsed) > 0)
        .map((item) => ({ consumableId: Number(item.consumableId), quantityUsed: Number(item.quantityUsed) }));
      const totalUsed = usage.reduce((total, item) => total + item.quantityUsed, 0);

      if (state.consumable.current_stock < totalUsed) {
        throw new maintenanceService.MaintenanceError('Stok BHP Sarung Tangan tidak cukup.', 'INSUFFICIENT_STOCK');
      }

      const id = state.nextMaintenanceId++;
      const stockBefore = state.consumable.current_stock;
      state.consumable.current_stock -= totalUsed;
      state.consumable.status = calculateStatus(state.consumable.current_stock, state.consumable.minimum_stock);
      state.asset.status = data.statusAfter;
      state.asset.asset_condition = data.conditionAfter;

      const log = {
        id,
        asset_id: state.asset.id,
        asset_name: state.asset.name,
        inventory_number: state.asset.inventory_number,
        maintenance_date: data.maintenanceDate,
        description: data.description,
        condition_before: data.conditionBefore,
        condition_after: data.conditionAfter,
        status_after: data.statusAfter,
        cost: Number(data.cost || 0),
        performed_by_name: actor.fullName,
      };
      state.maintenanceLogs.push(log);
      usage.forEach((item) => {
        state.maintenanceConsumables.push({
          id: item.consumableId,
          maintenance_log_id: id,
          name: state.consumable.name,
          unit: state.consumable.unit,
          quantity_used: item.quantityUsed,
        });
      });
      if (totalUsed > 0) {
        state.transactions.push({
          id: state.nextTransactionId++,
          transaction_type: 'OUT',
          quantity: totalUsed,
          stock_before: stockBefore,
          stock_after: state.consumable.current_stock,
          source_type: 'maintenance_log',
        });
      }
      state.statusHistories.push({
        changed_at: new Date('2026-05-22T00:00:00Z'),
        previous_status: 'active',
        new_status: data.statusAfter,
        previous_condition: 'good',
        new_condition: data.conditionAfter,
        changed_by_name: actor.fullName,
        note: 'Update dari maintenance log.',
      });
      return id;
    });

    assetsService.getAssetById.mockImplementation(async (id) => (
      Number(id) === state.asset.id ? state.asset : null
    ));
    assetsService.getStatusHistory.mockImplementation(async () => state.statusHistories);
    assetsService.getReplacementRelations.mockResolvedValue({ replacedBy: [], replaces: [] });
    assetsService.softDeleteAsset.mockImplementation(async (id, data, actor) => {
      state.asset.status = 'deleted';
      state.asset.deleted_at = new Date('2026-05-22T00:00:00Z');
      state.statusHistories.push({
        changed_at: new Date('2026-05-22T00:00:00Z'),
        previous_status: 'active',
        new_status: 'deleted',
        previous_condition: state.asset.asset_condition,
        new_condition: state.asset.asset_condition,
        changed_by_name: actor.fullName,
        note: data.reason,
      });
    });
  });

  it('covers BHP stock-in, stock-out, maintenance stock usage, insufficient stock, and soft delete history', async () => {
    const stafAdminAgent = await loginAs(stafAdmin);
    const stockInResponse = await stafAdminAgent.post('/consumables/receiving/50/stock-in').type('form').send({
      name: 'Sarung Tangan',
      unit: 'box',
      minimumStock: '2',
      roomId: '1',
      note: 'Stock in dari receiving',
    });
    expect(stockInResponse.headers.location).toBe('/consumables/1');
    expect(state.consumable.current_stock).toBe(5);

    const stockOutResponse = await stafAdminAgent.post('/consumables/1/transactions').type('form').send({
      transactionType: 'OUT',
      quantity: '2',
      note: 'Pemakaian praktikum',
    });
    expect(stockOutResponse.headers.location).toBe('/consumables/1');
    expect(state.consumable.current_stock).toBe(3);

    const excessiveStockOutResponse = await stafAdminAgent.post('/consumables/1/transactions').type('form').send({
      transactionType: 'OUT',
      quantity: '99',
      note: 'Tidak boleh negatif',
    });
    expect(excessiveStockOutResponse.headers.location).toBe('/consumables/1/transactions/new');
    expect(state.consumable.current_stock).toBe(3);

    const stafLabAgent = await loginAs(stafLab);
    const maintenanceResponse = await stafLabAgent.post('/maintenance').type('form').send({
      assetId: '1',
      maintenanceDate: '2026-05-22',
      description: 'Ganti pelindung',
      conditionBefore: 'good',
      conditionAfter: 'good',
      statusAfter: 'active',
      cost: '0',
      consumableIds: ['1'],
      consumableQuantities: ['2'],
    });
    expect(maintenanceResponse.headers.location).toBe('/maintenance/7');
    expect(state.consumable.current_stock).toBe(1);

    const failedMaintenanceResponse = await stafLabAgent.post('/maintenance').type('form').send({
      assetId: '1',
      maintenanceDate: '2026-05-22',
      description: 'Butuh stok berlebih',
      conditionBefore: 'good',
      conditionAfter: 'good',
      statusAfter: 'active',
      cost: '0',
      consumableIds: ['1'],
      consumableQuantities: ['5'],
    });
    expect(failedMaintenanceResponse.headers.location).toBe('/maintenance/new');
    expect(state.consumable.current_stock).toBe(1);

    const softDeleteResponse = await stafLabAgent.post('/assets/1/delete').type('form').send({
      reason: 'Rusak dan masuk histori',
    });
    expect(softDeleteResponse.headers.location).toBe('/assets/1');
    expect(state.asset.status).toBe('deleted');

    const assetDetailResponse = await stafLabAgent.get('/assets/1');
    expect(assetDetailResponse.status).toBe(200);
    expect(assetDetailResponse.text).toContain('deleted');
    expect(assetDetailResponse.text).toContain('Riwayat Status');
    expect(assetDetailResponse.text).toContain('Rusak dan masuk histori');
  });
});
