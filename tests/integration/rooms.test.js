const request = require('supertest');

jest.mock('../../src/modules/auth/auth.service', () => {
  class AuthError extends Error {}

  return {
    AuthError,
    login: jest.fn(),
    logout: jest.fn(),
  };
});

jest.mock('../../src/modules/rooms/rooms.service', () => ({
  listRooms: jest.fn(),
  getRoomById: jest.fn(),
  isCodeTaken: jest.fn(),
  createRoom: jest.fn(),
  updateRoom: jest.fn(),
  setRoomActive: jest.fn(),
}));

const app = require('../../app');
const authService = require('../../src/modules/auth/auth.service');
const roomsService = require('../../src/modules/rooms/rooms.service');

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

describe('Admin rooms module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects non-admin users', async () => {
    const agent = await loginAs(stafLab);

    const response = await agent.get('/rooms');

    expect(response.status).toBe(403);
  });

  it('renders room list for administrator', async () => {
    roomsService.listRooms.mockResolvedValue({
      rows: [{ id: 1, code: 'LAB-1', name: 'Laboratorium 1', location: 'Gedung A', is_active: 1 }],
      total: 1,
    });
    const agent = await loginAs(admin);

    const response = await agent.get('/rooms');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Manajemen Ruangan');
    expect(response.text).toContain('LAB-1');
  });

  it('creates a valid room', async () => {
    roomsService.isCodeTaken.mockResolvedValue(false);
    roomsService.createRoom.mockResolvedValue(1);
    const agent = await loginAs(admin);

    const response = await agent.post('/rooms').type('form').send({
      code: 'LAB-2',
      name: 'Laboratorium 2',
      location: 'Gedung B',
      description: '',
      isActive: 'on',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/rooms');
    expect(roomsService.createRoom).toHaveBeenCalled();
  });

  it('shows validation error for duplicate room code', async () => {
    roomsService.isCodeTaken.mockResolvedValue(true);
    const agent = await loginAs(admin);

    const response = await agent.post('/rooms').type('form').send({
      code: 'LAB-1',
      name: 'Laboratorium 1',
      location: 'Gedung A',
    });

    expect(response.status).toBe(422);
    expect(response.text).toContain('Kode ruangan sudah digunakan.');
  });

  it('deactivates a room', async () => {
    roomsService.getRoomById.mockResolvedValue({ id: 1, code: 'LAB-1', name: 'Laboratorium 1', is_active: 1 });
    roomsService.setRoomActive.mockResolvedValue();
    const agent = await loginAs(admin);

    const response = await agent.post('/rooms/1/deactivate');

    expect(response.status).toBe(302);
    expect(roomsService.setRoomActive).toHaveBeenCalledWith(1, false, expect.any(Object), expect.any(Object));
  });
});
