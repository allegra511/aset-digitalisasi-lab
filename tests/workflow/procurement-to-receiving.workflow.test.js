const request = require('supertest');

jest.mock('../../src/modules/auth/auth.service', () => {
  class AuthError extends Error {}

  return {
    AuthError,
    login: jest.fn(),
    logout: jest.fn(),
  };
});

jest.mock('../../src/modules/procurement/procurement.service', () => {
  class ProcurementError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'ProcurementError';
      this.code = code;
    }
  }

  return {
    ProcurementError,
    isDraftEditable: jest.fn(),
    listDraftsByCreator: jest.fn(),
    listSubmittedDrafts: jest.fn(),
    getDraftById: jest.fn(),
    getDraftForOwner: jest.fn(),
    listItemsByDraft: jest.fn(),
    getItemById: jest.fn(),
    listActiveRooms: jest.fn(),
    listReplacementCandidates: jest.fn(),
    createDraft: jest.fn(),
    updateDraft: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    deleteItem: jest.fn(),
    submitDraft: jest.fn(),
    approveItem: jest.fn(),
    rejectItem: jest.fn(),
    finalizeDraft: jest.fn(),
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
const procurementService = require('../../src/modules/procurement/procurement.service');
const receivingService = require('../../src/modules/receiving/receiving.service');
const assetsService = require('../../src/modules/assets/assets.service');

const kepalaLab = {
  id: 2,
  fullName: 'Kepala Lab',
  email: 'kalab@example.test',
  username: 'kalab',
  roleId: 2,
  roleName: 'kepala_laboratorium',
  roleLabel: 'Kepala Laboratorium',
};

const kaprodi = {
  id: 3,
  fullName: 'Kaprodi',
  email: 'kaprodi@example.test',
  username: 'kaprodi',
  roleId: 3,
  roleName: 'ketua_program_studi',
  roleLabel: 'Ketua Program Studi',
};

const stafAdmin = {
  id: 4,
  fullName: 'Staf Admin',
  email: 'stafadmin@example.test',
  username: 'stafadmin',
  roleId: 4,
  roleName: 'staf_administrasi',
  roleLabel: 'Staf Administrasi',
};

const users = new Map([kepalaLab, kaprodi, stafAdmin].map((user) => [user.username, user]));

async function loginAs(user) {
  authService.login.mockResolvedValueOnce(user);
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ identifier: user.username, password: 'password123' });
  return agent;
}

function createWorkflowState() {
  return {
    nextDraftId: 10,
    nextItemId: 20,
    nextReceivingId: 30,
    drafts: [],
    items: [],
    receivingRecords: [],
  };
}

describe('Workflow: procurement review to receiving', () => {
  let state;

  beforeEach(() => {
    jest.clearAllMocks();
    state = createWorkflowState();

    authService.login.mockImplementation(({ identifier }) => Promise.resolve(users.get(identifier)));

    procurementService.isDraftEditable.mockImplementation((draft) => draft?.status === 'draft' && !draft.is_locked);
    procurementService.listActiveRooms.mockResolvedValue([{ id: 1, code: 'LAB-1', name: 'Laboratorium 1' }]);
    procurementService.listReplacementCandidates.mockResolvedValue([]);
    procurementService.createDraft.mockImplementation(async (data, actor) => {
      const draft = {
        id: state.nextDraftId++,
        year: Number(data.year),
        title: data.title,
        notes: data.notes || '',
        status: 'draft',
        is_locked: 0,
        created_by_user_id: actor.id,
        creator_name: actor.fullName,
      };
      state.drafts.push(draft);
      return draft.id;
    });
    procurementService.getDraftForOwner.mockImplementation(async (draftId, userId) => (
      state.drafts.find((draft) => draft.id === draftId && draft.created_by_user_id === userId) || null
    ));
    procurementService.getDraftById.mockImplementation(async (draftId) => (
      state.drafts.find((draft) => draft.id === draftId) || null
    ));
    procurementService.listItemsByDraft.mockImplementation(async (draftId) => (
      state.items.filter((item) => item.draft_id === draftId)
    ));
    procurementService.createItem.mockImplementation(async (draftId, data) => {
      const draft = state.drafts.find((item) => item.id === draftId);
      if (!draft || !procurementService.isDraftEditable(draft)) {
        throw new procurementService.ProcurementError('Item pada draf submitted atau finalized tidak bisa diedit.', 'DRAFT_LOCKED');
      }
      const item = {
        id: state.nextItemId++,
        draft_id: draftId,
        item_type: data.itemType,
        name: data.name,
        specification: data.specification || '',
        quantity_requested: Number(data.quantityRequested),
        quantity_approved: null,
        estimated_unit_price: Number(data.estimatedUnitPrice || 0),
        room_id: Number(data.roomId || 1),
        room_name: 'Laboratorium 1',
        review_status: 'draft',
        receiving_status: 'not_received',
      };
      state.items.push(item);
      return item.id;
    });
    procurementService.submitDraft.mockImplementation(async (draftId) => {
      const draft = state.drafts.find((item) => item.id === draftId);
      const draftItems = state.items.filter((item) => item.draft_id === draftId);
      if (!draftItems.length) {
        throw new procurementService.ProcurementError('Draf harus memiliki minimal satu item sebelum submit.', 'EMPTY_DRAFT');
      }
      draft.status = 'submitted';
      draftItems.forEach((item) => {
        item.review_status = 'pending_review';
      });
    });
    procurementService.approveItem.mockImplementation(async (draftId, itemId) => {
      const item = state.items.find((record) => record.id === itemId && record.draft_id === draftId);
      item.review_status = 'approved';
      item.quantity_approved = item.quantity_requested;
    });
    procurementService.rejectItem.mockImplementation(async (draftId, itemId, reviewNote) => {
      const item = state.items.find((record) => record.id === itemId && record.draft_id === draftId);
      item.review_status = 'rejected';
      item.quantity_approved = 0;
      item.review_note = reviewNote;
    });
    procurementService.finalizeDraft.mockImplementation(async (draftId) => {
      const draft = state.drafts.find((record) => record.id === draftId);
      const hasPending = state.items.some((item) => item.draft_id === draftId && !['approved', 'rejected'].includes(item.review_status));
      if (hasPending) {
        throw new procurementService.ProcurementError('Semua item harus direview sebelum finalisasi.', 'PENDING_ITEMS');
      }
      draft.status = 'finalized';
      draft.is_locked = 1;
    });

    receivingService.listReceivingRecords.mockImplementation(async (itemId) => (
      state.receivingRecords.filter((record) => record.procurement_item_id === itemId)
    ));
    receivingService.getReceivableItem.mockImplementation(async (itemId) => {
      const item = state.items.find((record) => record.id === itemId);
      if (!item || item.review_status !== 'approved') {
        return null;
      }
      const receivedQuantity = state.receivingRecords
        .filter((record) => record.procurement_item_id === itemId)
        .reduce((total, record) => total + record.received_quantity, 0);
      return {
        ...item,
        received_quantity: receivedQuantity,
        remaining_quantity: Number(item.quantity_approved || 0) - receivedQuantity,
        draft_title: state.drafts.find((draft) => draft.id === item.draft_id)?.title,
      };
    });
    receivingService.createReceivingRecord.mockImplementation(async (itemId, data, actor) => {
      const item = await receivingService.getReceivableItem(itemId);
      const storedItem = state.items.find((record) => record.id === itemId);
      const requestedQuantity = Number(data.receivedQuantity);
      if (requestedQuantity > item.remaining_quantity) {
        throw new receivingService.ReceivingError('Jumlah diterima tidak boleh melebihi sisa quantity approved.', 'OVER_RECEIVE');
      }
      const record = {
        id: state.nextReceivingId++,
        procurement_item_id: itemId,
        item_name: item.name,
        item_type: item.item_type,
        specification: item.specification,
        room_id: item.room_id,
        room_name: item.room_name,
        received_quantity: requestedQuantity,
        received_date: data.receivedDate,
        receiver_user_id: actor.id,
        receiver_name: actor.fullName,
      };
      state.receivingRecords.push(record);
      storedItem.receiving_status = requestedQuantity === item.remaining_quantity ? 'fully_received' : 'partially_received';
      return record.id;
    });

    assetsService.listRooms.mockResolvedValue([{ id: 1, code: 'LAB-1', name: 'Laboratorium 1' }]);
    assetsService.isInventoryNumberTaken.mockResolvedValue(true);
    assetsService.getReceivingRecordForAssetCreation.mockImplementation(async (receivingId) => (
      state.receivingRecords.find((record) => record.id === receivingId) || null
    ));
  });

  it('covers draft submit, review decisions, partial receiving, over receiving, and duplicate inventory number', async () => {
    const kepalaAgent = await loginAs(kepalaLab);

    const createDraftResponse = await kepalaAgent.post('/procurement/drafts').type('form').send({
      year: '2026',
      title: 'Pengadaan Workflow',
      notes: '',
    });
    expect(createDraftResponse.headers.location).toBe('/procurement/drafts/10');

    await kepalaAgent.post('/procurement/drafts/10/items').type('form').send({
      itemType: 'asset',
      name: 'Mikroskop',
      specification: 'Digital',
      quantityRequested: '2',
      estimatedUnitPrice: '1500000',
      roomId: '1',
    });

    await kepalaAgent.post('/procurement/drafts/10/items').type('form').send({
      itemType: 'consumable',
      name: 'Sarung Tangan',
      specification: 'Latex',
      quantityRequested: '5',
      estimatedUnitPrice: '50000',
      roomId: '1',
    });

    const submitResponse = await kepalaAgent.post('/procurement/drafts/10/submit');
    expect(submitResponse.headers.location).toBe('/procurement/drafts/10');
    expect(state.drafts[0].status).toBe('submitted');

    const kaprodiAgent = await loginAs(kaprodi);
    await kaprodiAgent.post('/procurement/review/10/items/20/approve');
    expect(state.items[0].review_status).toBe('approved');

    const rejectWithoutNoteResponse = await kaprodiAgent
      .post('/procurement/review/10/items/21/reject')
      .type('form')
      .send({ reviewNote: '' });
    expect(rejectWithoutNoteResponse.headers.location).toBe('/procurement/review/10');
    expect(state.items[1].review_status).toBe('pending_review');

    const failedFinalizeResponse = await kaprodiAgent.post('/procurement/review/10/finalize');
    expect(failedFinalizeResponse.headers.location).toBe('/procurement/review/10');
    expect(state.drafts[0].status).toBe('submitted');

    await kaprodiAgent.post('/procurement/review/10/items/21/reject').type('form').send({ reviewNote: 'Stok masih cukup' });
    const finalizeResponse = await kaprodiAgent.post('/procurement/review/10/finalize');
    expect(finalizeResponse.headers.location).toBe('/procurement/review');
    expect(state.drafts[0].status).toBe('finalized');

    const stafAdminAgent = await loginAs(stafAdmin);
    const partialReceivingResponse = await stafAdminAgent.post('/receiving/items/20/receive').type('form').send({
      receivedQuantity: '1',
      receivedDate: '2026-05-22',
      supplierName: 'Supplier A',
    });
    expect(partialReceivingResponse.headers.location).toBe('/receiving');
    expect(state.items[0].receiving_status).toBe('partially_received');

    const overReceivingResponse = await stafAdminAgent.post('/receiving/items/20/receive').type('form').send({
      receivedQuantity: '5',
      receivedDate: '2026-05-22',
    });
    expect(overReceivingResponse.headers.location).toBe('/receiving/items/20/receive');

    const duplicateInventoryResponse = await stafAdminAgent.post('/assets/receiving/30').type('form').send({
      inventoryNumber: 'INV-001',
      name: 'Mikroskop',
      roomId: '1',
      assetCondition: 'good',
      acquisitionDate: '2026-05-22',
    });
    expect(duplicateInventoryResponse.status).toBe(422);
    expect(duplicateInventoryResponse.text).toContain('Nomor inventaris sudah digunakan.');
  });
});
