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

const sessionUser = {
  id: 1,
  fullName: 'Administrator',
  email: 'admin@example.test',
  username: 'admin',
  roleId: 1,
  roleName: 'administrator',
  roleLabel: 'Administrator',
};

describe('Public homepage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders public homepage without authentication', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Kelola aset lab tanpa data yang tercecer.');
    expect(response.text).toContain('Dibuat agar pekerjaan lab terasa lebih ringan.');
    expect(response.text).toContain('Masuk Sistem');
    expect(response.text).toContain('/images/homepage-hero.png');
    expect(response.text).not.toContain('/health');
  });

  it('keeps login page available', async () => {
    const response = await request(app).get('/auth/login');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Email atau Username');
  });

  it('still redirects anonymous protected routes to login', async () => {
    const response = await request(app).get('/dashboard');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/auth/login');
  });

  it('shows dashboard action for authenticated users on homepage', async () => {
    authService.login.mockResolvedValueOnce(sessionUser);
    const agent = request.agent(app);
    await agent.post('/auth/login').type('form').send({ identifier: 'admin', password: 'password123' });

    const response = await agent.get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Buka Dashboard');
    expect(response.text).toContain('/dashboard');
  });
});
