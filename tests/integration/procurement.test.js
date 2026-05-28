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
    isDraftEditable: jest.fn((draft) => draft?.status === 'draft' && !draft.is_locked),
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

const app = require('../../app');
const authService = require('../../src/modules/auth/auth.service');
const procurementService = require('../../src/modules/procurement/procurement.service');

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

const stafLab = {
  id: 5,
  fullName: 'Staf Lab',
  email: 'staflab@example.test',
  username: 'staflab',
  roleId: 5,
  roleName: 'staf_laboratorium',
  roleLabel: 'Staf Laboratorium',
};

const draft = {
  id: 10,
  year: 2026,
  title: 'Pengadaan 2026',
  status: 'draft',
  is_locked: 0,
  notes: '',
  created_by_user_id: 2,
  creator_name: 'Kepala Lab',
};

const submittedDraft = {
  ...draft,
  status: 'submitted',
  submitted_at: new Date('2026-05-20T10:00:00Z'),
};

const pendingItem = {
  id: 20,
  draft_id: 10,
  item_type: 'asset',
  name: 'Mikroskop',
  specification: 'Digital',
  quantity_requested: 2,
  estimated_unit_price: '1500000.00',
  room_id: 1,
  room_name: 'Laboratorium 1',
  review_status: 'pending_review',
  receiving_status: 'not_received',
};

async function loginAs(user) {
  authService.login.mockResolvedValueOnce(user);
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ identifier: user.username, password: 'password123' });
  return agent;
}

describe('Procurement draft and review flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    procurementService.listActiveRooms.mockResolvedValue([{ id: 1, code: 'LAB-1', name: 'Laboratorium 1' }]);
    procurementService.listReplacementCandidates.mockResolvedValue([]);
  });

  it('allows kepala laboratorium to open draft list', async () => {
    procurementService.listDraftsByCreator.mockResolvedValue({
      rows: [{ ...draft, updated_at: new Date('2026-05-20T10:00:00Z') }],
      total: 1,
    });
    const agent = await loginAs(kepalaLab);

    const response = await agent.get('/procurement/drafts');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Draf Pengadaan');
    expect(response.text).toContain('Pengadaan 2026');
  });

  it('rejects non kepala laboratorium from creating draft', async () => {
    const agent = await loginAs(stafLab);

    const response = await agent.get('/procurement/drafts/new');

    expect(response.status).toBe(403);
  });

  it('creates a draft for kepala laboratorium', async () => {
    procurementService.createDraft.mockResolvedValue(10);
    const agent = await loginAs(kepalaLab);

    const response = await agent.post('/procurement/drafts').type('form').send({
      year: '2026',
      title: 'Pengadaan 2026',
      notes: '',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/procurement/drafts/10');
    expect(procurementService.createDraft).toHaveBeenCalled();
  });

  it('does not show edit form for submitted drafts', async () => {
    procurementService.getDraftForOwner.mockResolvedValue(submittedDraft);
    procurementService.isDraftEditable.mockReturnValue(false);
    const agent = await loginAs(kepalaLab);

    const response = await agent.get('/procurement/drafts/10/edit');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/procurement/drafts/10');
  });

  it('shows error when submitting empty draft', async () => {
    procurementService.submitDraft.mockRejectedValue(
      new procurementService.ProcurementError('Draf harus memiliki minimal satu item sebelum submit.', 'EMPTY_DRAFT')
    );
    const agent = await loginAs(kepalaLab);

    const response = await agent.post('/procurement/drafts/10/submit');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/procurement/drafts/10');
  });

  it('submits draft with items', async () => {
    procurementService.submitDraft.mockResolvedValue();
    const agent = await loginAs(kepalaLab);

    const response = await agent.post('/procurement/drafts/10/submit');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/procurement/drafts/10');
    expect(procurementService.submitDraft).toHaveBeenCalledWith(10, expect.any(Object), expect.any(Object));
  });

  it('creates a valid procurement item', async () => {
    procurementService.getDraftForOwner.mockResolvedValue(draft);
    procurementService.isDraftEditable.mockReturnValue(true);
    procurementService.createItem.mockResolvedValue(20);
    const agent = await loginAs(kepalaLab);

    const response = await agent.post('/procurement/drafts/10/items').type('form').send({
      itemType: 'asset',
      name: 'Mikroskop',
      specification: 'Digital',
      quantityRequested: '2',
      estimatedUnitPrice: '1500000',
      roomId: '1',
      referenceLink: '',
      notes: '',
      replacementCandidateAssetId: '',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/procurement/drafts/10');
    expect(procurementService.createItem).toHaveBeenCalled();
  });

  it('rejects invalid procurement item', async () => {
    procurementService.getDraftForOwner.mockResolvedValue(draft);
    const agent = await loginAs(kepalaLab);

    const response = await agent.post('/procurement/drafts/10/items').type('form').send({
      itemType: 'service',
      name: '',
      quantityRequested: '0',
      estimatedUnitPrice: '-1',
    });

    expect(response.status).toBe(422);
    expect(response.text).toContain('Jenis item harus asset atau consumable.');
  });

  it('allows kaprodi to open submitted draft review list', async () => {
    procurementService.listSubmittedDrafts.mockResolvedValue({
      rows: [{ ...submittedDraft, creator_name: 'Kepala Lab' }],
      total: 1,
    });
    const agent = await loginAs(kaprodi);

    const response = await agent.get('/procurement/review');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Review Pengadaan');
    expect(response.text).toContain('Pengadaan 2026');
  });

  it('rejects non kaprodi from review routes', async () => {
    const agent = await loginAs(kepalaLab);

    const response = await agent.get('/procurement/review');

    expect(response.status).toBe(403);
  });

  it('approves pending item', async () => {
    procurementService.approveItem.mockResolvedValue();
    const agent = await loginAs(kaprodi);

    const response = await agent.post('/procurement/review/10/items/20/approve');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/procurement/review/10');
    expect(procurementService.approveItem).toHaveBeenCalledWith(10, 20, expect.any(Object), expect.any(Object));
  });

  it('rejects item without note', async () => {
    const agent = await loginAs(kaprodi);

    const response = await agent.post('/procurement/review/10/items/20/reject').type('form').send({ reviewNote: '' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/procurement/review/10');
    expect(procurementService.rejectItem).not.toHaveBeenCalled();
  });

  it('rejects item with note', async () => {
    procurementService.rejectItem.mockResolvedValue();
    const agent = await loginAs(kaprodi);

    const response = await agent
      .post('/procurement/review/10/items/20/reject')
      .type('form')
      .send({ reviewNote: 'Prioritas rendah' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/procurement/review/10');
    expect(procurementService.rejectItem).toHaveBeenCalledWith(10, 20, 'Prioritas rendah', expect.any(Object), expect.any(Object));
  });

  it('shows finalize error if pending items remain', async () => {
    procurementService.finalizeDraft.mockRejectedValue(
      new procurementService.ProcurementError('Semua item harus direview sebelum finalisasi.', 'PENDING_ITEMS')
    );
    const agent = await loginAs(kaprodi);

    const response = await agent.post('/procurement/review/10/finalize');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/procurement/review/10');
  });

  it('finalizes reviewed draft', async () => {
    procurementService.finalizeDraft.mockResolvedValue();
    const agent = await loginAs(kaprodi);

    const response = await agent.post('/procurement/review/10/finalize');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/procurement/review');
    expect(procurementService.finalizeDraft).toHaveBeenCalledWith(10, expect.any(Object), expect.any(Object));
  });

  it('renders review detail with pending item controls', async () => {
    procurementService.getDraftById.mockResolvedValue(submittedDraft);
    procurementService.listItemsByDraft.mockResolvedValue([pendingItem]);
    const agent = await loginAs(kaprodi);

    const response = await agent.get('/procurement/review/10');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Mikroskop');
    expect(response.text).toContain('Approve');
    expect(response.text).toContain('Reject');
  });
});
