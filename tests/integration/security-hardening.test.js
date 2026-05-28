const request = require('supertest');

jest.mock('../../src/modules/auth/auth.service', () => {
  class AuthError extends Error {}

  return {
    AuthError,
    login: jest.fn(),
    logout: jest.fn(),
  };
});

const app = require('../../app');
const authService = require('../../src/modules/auth/auth.service');

const users = {
  administrator: {
    id: 1,
    fullName: 'Administrator',
    email: 'admin@example.test',
    username: 'admin',
    roleId: 1,
    roleName: 'administrator',
    roleLabel: 'Administrator',
  },
  kepalaLab: {
    id: 2,
    fullName: 'Kepala Lab',
    email: 'kalab@example.test',
    username: 'kalab',
    roleId: 2,
    roleName: 'kepala_laboratorium',
    roleLabel: 'Kepala Laboratorium',
  },
  kaprodi: {
    id: 3,
    fullName: 'Kaprodi',
    email: 'kaprodi@example.test',
    username: 'kaprodi',
    roleId: 3,
    roleName: 'ketua_program_studi',
    roleLabel: 'Ketua Program Studi',
  },
  stafAdmin: {
    id: 4,
    fullName: 'Staf Admin',
    email: 'stafadmin@example.test',
    username: 'stafadmin',
    roleId: 4,
    roleName: 'staf_administrasi',
    roleLabel: 'Staf Administrasi',
  },
  stafLab: {
    id: 5,
    fullName: 'Staf Lab',
    email: 'staflab@example.test',
    username: 'staflab',
    roleId: 5,
    roleName: 'staf_laboratorium',
    roleLabel: 'Staf Laboratorium',
  },
};

async function loginAs(user) {
  authService.login.mockResolvedValueOnce(user);
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ identifier: user.username, password: 'password123' });
  return agent;
}

describe('Route hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    '/users',
    '/rooms',
    '/audit',
    '/procurement/drafts',
    '/procurement/review',
    '/receiving',
    '/maintenance',
    '/assets/1/delete',
    '/assets/1/replacements/new',
    '/consumables/1/transactions/new',
    '/reports',
  ])('redirects anonymous GET %s to login', async (path) => {
    const response = await request(app).get(path);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/auth/login');
  });

  it.each([
    [users.stafLab, '/users'],
    [users.kepalaLab, '/rooms'],
    [users.stafLab, '/audit'],
    [users.kaprodi, '/procurement/drafts'],
    [users.kepalaLab, '/procurement/review'],
    [users.kepalaLab, '/receiving'],
    [users.stafAdmin, '/maintenance'],
    [users.stafAdmin, '/assets/1/delete'],
    [users.kepalaLab, '/consumables/1/transactions/new'],
  ])('returns 403 when %s opens forbidden route %s', async (user, path) => {
    const agent = await loginAs(user);

    const response = await agent.get(path);

    expect(response.status).toBe(403);
    expect(response.text).toContain('Anda tidak memiliki akses ke halaman ini.');
  });
});
