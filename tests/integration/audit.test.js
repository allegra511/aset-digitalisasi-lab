const request = require('supertest');

jest.mock('../../src/modules/auth/auth.service', () => {
  class AuthError extends Error {}

  return {
    AuthError,
    login: jest.fn(),
    logout: jest.fn(),
  };
});

jest.mock('../../src/modules/audit/audit.service', () => ({
  logAction: jest.fn(),
  listAuditLogs: jest.fn(),
  getAuditLogById: jest.fn(),
  listAuditUsers: jest.fn(),
}));

const app = require('../../app');
const authService = require('../../src/modules/auth/auth.service');
const auditService = require('../../src/modules/audit/audit.service');

const administrator = {
  id: 1,
  fullName: 'Administrator',
  email: 'admin@example.test',
  username: 'admin',
  roleId: 1,
  roleName: 'administrator',
  roleLabel: 'Administrator',
};

const stafLab = {
  ...administrator,
  id: 5,
  roleName: 'staf_laboratorium',
  roleLabel: 'Staf Laboratorium',
};

async function loginAs(user) {
  authService.login.mockResolvedValueOnce(user);
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ identifier: user.username, password: 'password123' });
  return agent;
}

describe('Audit module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auditService.listAuditUsers.mockResolvedValue([
      { id: 1, full_name: 'Administrator', email: 'admin@example.test' },
    ]);
  });

  it('renders audit list for administrator', async () => {
    auditService.listAuditLogs.mockResolvedValue({
      rows: [
        {
          id: 1,
          user_name: 'Administrator',
          action: 'CREATE_ASSET',
          entity: 'assets',
          entity_id: 10,
          ip_address: '127.0.0.1',
          created_at: new Date('2026-05-22T00:00:00Z'),
        },
      ],
      total: 1,
    });
    const agent = await loginAs(administrator);

    const response = await agent.get('/audit');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Audit Logs');
    expect(response.text).toContain('CREATE_ASSET');
  });

  it('rejects non administrator from audit list', async () => {
    const agent = await loginAs(stafLab);

    const response = await agent.get('/audit');

    expect(response.status).toBe(403);
  });

  it('passes filters to audit service', async () => {
    auditService.listAuditLogs.mockResolvedValue({ rows: [], total: 0 });
    const agent = await loginAs(administrator);

    const response = await agent.get('/audit').query({
      search: 'LOGIN',
      action: 'LOGIN_SUCCESS',
      entity: 'users',
      userId: '1',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-22',
    });

    expect(response.status).toBe(200);
    expect(auditService.listAuditLogs).toHaveBeenCalledWith(expect.objectContaining({
      search: 'LOGIN',
      action: 'LOGIN_SUCCESS',
      entity: 'users',
      userId: '1',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-22',
    }));
  });

  it('renders empty audit state', async () => {
    auditService.listAuditLogs.mockResolvedValue({ rows: [], total: 0 });
    const agent = await loginAs(administrator);

    const response = await agent.get('/audit');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Belum ada audit log');
  });

  it('renders audit detail with before and after data', async () => {
    auditService.getAuditLogById.mockResolvedValue({
      id: 1,
      user_name: 'Administrator',
      user_email: 'admin@example.test',
      action: 'UPDATE_ROOM',
      entity: 'rooms',
      entity_id: 3,
      before_data: { name: 'Lab Lama' },
      after_data: { name: 'Lab Baru' },
      ip_address: '127.0.0.1',
      user_agent: 'Jest',
      created_at: new Date('2026-05-22T00:00:00Z'),
    });
    const agent = await loginAs(administrator);

    const response = await agent.get('/audit/1');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Detail Audit');
    expect(response.text).toContain('UPDATE_ROOM');
    expect(response.text).toContain('Lab Lama');
    expect(response.text).toContain('Lab Baru');
  });
});
