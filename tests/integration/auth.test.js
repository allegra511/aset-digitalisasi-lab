const request = require('supertest');

jest.mock('../../src/modules/auth/auth.service', () => {
  class AuthError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'AuthError';
      this.code = code;
    }
  }

  return {
    AuthError,
    login: jest.fn(),
    logout: jest.fn(),
  };
});

jest.mock('../../src/modules/dashboard/dashboard.service', () => ({
  getDashboardData: jest.fn().mockResolvedValue({
    title: 'Dashboard Administrator',
    description: 'Ringkasan admin',
    metrics: [{ label: 'User Aktif', value: 1, note: 'Akun aktif', tone: 'success' }],
    sections: [],
  }),
}));

const app = require('../../app');
const authService = require('../../src/modules/auth/auth.service');

const sessionUser = {
  id: 1,
  fullName: 'Administrator',
  email: 'admin@example.test',
  username: 'admin',
  roleId: 1,
  roleName: 'administrator',
  roleLabel: 'Administrator',
};

describe('Authentication routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders login page', async () => {
    const response = await request(app).get('/auth/login');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Email atau Username');
    expect(response.text).toContain('Password');
  });

  it('logs in with valid credentials and opens dashboard', async () => {
    authService.login.mockResolvedValue(sessionUser);
    const agent = request.agent(app);

    const loginResponse = await agent
      .post('/auth/login')
      .type('form')
      .send({ identifier: 'admin', password: 'admin12345' });

    expect(loginResponse.status).toBe(302);
    expect(loginResponse.headers.location).toBe('/dashboard');

    const dashboardResponse = await agent.get('/dashboard');

    expect(dashboardResponse.status).toBe(200);
    expect(dashboardResponse.text).toContain('Selamat datang, Administrator');
    expect(dashboardResponse.text).toContain('Dashboard Administrator');
  });

  it('shows an error when password is wrong', async () => {
    authService.login.mockRejectedValue(
      new authService.AuthError('Email/username atau password salah.', 'INVALID_CREDENTIALS')
    );

    const response = await request(app)
      .post('/auth/login')
      .type('form')
      .send({ identifier: 'admin', password: 'wrong-password' });

    expect(response.status).toBe(401);
    expect(response.text).toContain('Email/username atau password salah.');
  });

  it('rejects inactive users', async () => {
    authService.login.mockRejectedValue(
      new authService.AuthError('Akun tidak aktif. Hubungi administrator.', 'INACTIVE_USER')
    );

    const response = await request(app)
      .post('/auth/login')
      .type('form')
      .send({ identifier: 'inactive@example.test', password: 'admin12345' });

    expect(response.status).toBe(401);
    expect(response.text).toContain('Akun tidak aktif. Hubungi administrator.');
  });

  it('redirects anonymous dashboard access to login', async () => {
    const response = await request(app).get('/dashboard');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/auth/login');
  });

  it('logs out and clears access to dashboard', async () => {
    authService.login.mockResolvedValue(sessionUser);
    authService.logout.mockResolvedValue();
    const agent = request.agent(app);

    await agent.post('/auth/login').type('form').send({ identifier: 'admin', password: 'admin12345' });

    const logoutResponse = await agent.post('/auth/logout');

    expect(logoutResponse.status).toBe(302);
    expect(logoutResponse.headers.location).toBe('/auth/login');

    const dashboardResponse = await agent.get('/dashboard');

    expect(dashboardResponse.status).toBe(302);
    expect(dashboardResponse.headers.location).toBe('/auth/login');
  });
});
