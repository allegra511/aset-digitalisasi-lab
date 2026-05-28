const request = require('supertest');

jest.mock('../../src/modules/auth/auth.service', () => {
  class AuthError extends Error {}

  return {
    AuthError,
    login: jest.fn(),
    logout: jest.fn(),
  };
});

jest.mock('../../src/modules/users/users.service', () => ({
  listUsers: jest.fn(),
  listRoles: jest.fn(),
  getUserById: jest.fn(),
  roleExists: jest.fn(),
  isEmailTaken: jest.fn(),
  isUsernameTaken: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  resetPassword: jest.fn(),
  setUserActive: jest.fn(),
}));

const app = require('../../app');
const authService = require('../../src/modules/auth/auth.service');
const usersService = require('../../src/modules/users/users.service');

const admin = {
  id: 1,
  fullName: 'Administrator',
  email: 'admin@example.test',
  username: 'admin',
  roleId: 1,
  roleName: 'administrator',
  roleLabel: 'Administrator',
};

const stafLab = {
  ...admin,
  id: 2,
  fullName: 'Staf Lab',
  roleName: 'staf_laboratorium',
  roleLabel: 'Staf Laboratorium',
};

async function loginAs(user) {
  authService.login.mockResolvedValueOnce(user);
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ identifier: user.username, password: 'password123' });
  return agent;
}

describe('Admin users module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usersService.listRoles.mockResolvedValue([
      { id: 1, name: 'administrator', label: 'Administrator' },
      { id: 2, name: 'staf_laboratorium', label: 'Staf Laboratorium' },
    ]);
  });

  it('rejects non-admin users', async () => {
    const agent = await loginAs(stafLab);

    const response = await agent.get('/users');

    expect(response.status).toBe(403);
  });

  it('renders user list for administrator', async () => {
    usersService.listUsers.mockResolvedValue({
      rows: [{ id: 1, full_name: 'Administrator', email: 'admin@example.test', username: 'admin', role_label: 'Administrator', is_active: 1 }],
      total: 1,
    });
    const agent = await loginAs(admin);

    const response = await agent.get('/users');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Manajemen Pengguna');
    expect(response.text).toContain('admin@example.test');
  });

  it('creates a valid user', async () => {
    usersService.roleExists.mockResolvedValue(true);
    usersService.isEmailTaken.mockResolvedValue(false);
    usersService.isUsernameTaken.mockResolvedValue(false);
    usersService.createUser.mockResolvedValue(10);
    const agent = await loginAs(admin);

    const response = await agent.post('/users').type('form').send({
      fullName: 'User Baru',
      email: 'baru@example.test',
      username: 'baru',
      phone: '',
      roleId: '2',
      password: 'password123',
      isActive: 'on',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/users');
    expect(usersService.createUser).toHaveBeenCalled();
  });

  it('shows validation error for duplicate email', async () => {
    usersService.roleExists.mockResolvedValue(true);
    usersService.isEmailTaken.mockResolvedValue(true);
    usersService.isUsernameTaken.mockResolvedValue(false);
    const agent = await loginAs(admin);

    const response = await agent.post('/users').type('form').send({
      fullName: 'User Baru',
      email: 'admin@example.test',
      username: 'baru',
      roleId: '2',
      password: 'password123',
    });

    expect(response.status).toBe(422);
    expect(response.text).toContain('Email sudah digunakan.');
  });

  it('deactivates a user', async () => {
    usersService.getUserById.mockResolvedValue({ id: 2, full_name: 'User Baru', is_active: 1 });
    usersService.setUserActive.mockResolvedValue();
    const agent = await loginAs(admin);

    const response = await agent.post('/users/2/deactivate');

    expect(response.status).toBe(302);
    expect(usersService.setUserActive).toHaveBeenCalledWith(2, false, expect.any(Object), expect.any(Object));
  });

  it('resets a user password', async () => {
    usersService.getUserById.mockResolvedValue({ id: 2, full_name: 'User Baru', role_id: 2, email: 'u@example.test', username: 'user', is_active: 1 });
    usersService.resetPassword.mockResolvedValue();
    const agent = await loginAs(admin);

    const response = await agent.post('/users/2/reset-password').type('form').send({ password: 'newpassword123' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/users/2/edit');
    expect(usersService.resetPassword).toHaveBeenCalledWith(2, 'newpassword123', expect.any(Object), expect.any(Object));
  });
});
