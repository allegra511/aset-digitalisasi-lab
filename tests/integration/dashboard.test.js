const request = require('supertest');

jest.mock('../../src/modules/auth/auth.service', () => {
  class AuthError extends Error {}

  return {
    AuthError,
    login: jest.fn(),
    logout: jest.fn(),
  };
});

jest.mock('../../src/modules/dashboard/dashboard.service', () => ({
  getDashboardData: jest.fn(),
}));

const app = require('../../app');
const authService = require('../../src/modules/auth/auth.service');
const dashboardService = require('../../src/modules/dashboard/dashboard.service');

function user(roleName, roleLabel) {
  return {
    id: roleName === 'kepala_laboratorium' ? 2 : 1,
    fullName: roleLabel,
    email: `${roleName}@example.test`,
    username: roleName,
    roleId: 1,
    roleName,
    roleLabel,
  };
}

describe('Role dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders administrator metrics only for administrator', async () => {
    authService.login.mockResolvedValue(user('administrator', 'Administrator'));
    dashboardService.getDashboardData.mockResolvedValue({
      title: 'Dashboard Administrator',
      description: 'Ringkasan konfigurasi sistem.',
      metrics: [{ label: 'User Aktif', value: 2, note: 'Akun yang bisa login', tone: 'success' }],
      sections: [],
    });

    const agent = request.agent(app);
    await agent.post('/auth/login').type('form').send({ identifier: 'admin', password: 'password123' });

    const response = await agent.get('/dashboard');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Dashboard Administrator');
    expect(response.text).toContain('User Aktif');
    expect(response.text).not.toContain('Draf Terbaru');
  });

  it('renders kepala laboratorium dashboard data', async () => {
    authService.login.mockResolvedValue(user('kepala_laboratorium', 'Kepala Laboratorium'));
    dashboardService.getDashboardData.mockResolvedValue({
      title: 'Dashboard Kepala Laboratorium',
      description: 'Ringkasan draf pengadaan.',
      metrics: [{ label: 'Draft', value: 0, note: 'Masih bisa diedit' }],
      sections: [
        {
          title: 'Draf Terbaru',
          emptyTitle: 'Belum ada draf pengadaan',
          emptyMessage: 'Draf pengadaan milik akun ini akan tampil di sini.',
          items: [],
        },
      ],
    });

    const agent = request.agent(app);
    await agent.post('/auth/login').type('form').send({ identifier: 'kalab', password: 'password123' });

    const response = await agent.get('/dashboard');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Dashboard Kepala Laboratorium');
    expect(response.text).toContain('Belum ada draf pengadaan');
  });

  it('redirects anonymous dashboard access to login', async () => {
    const response = await request(app).get('/dashboard');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/auth/login');
  });
});
