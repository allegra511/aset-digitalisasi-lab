const request = require('supertest');

jest.mock('../../src/modules/auth/auth.service', () => {
  class AuthError extends Error {}

  return {
    AuthError,
    login: jest.fn(),
    logout: jest.fn(),
  };
});

jest.mock('../../src/modules/reports/reports.service', () => ({
  getReportDefinition: jest.fn(),
  listReportTypes: jest.fn(),
  listReportRows: jest.fn(),
  listReportExportRows: jest.fn(),
  listRooms: jest.fn(),
}));

const app = require('../../app');
const authService = require('../../src/modules/auth/auth.service');
const reportsService = require('../../src/modules/reports/reports.service');

const reportDefinition = {
  title: 'Laporan Inventaris',
  description: 'Daftar aset dan statusnya.',
  emptyTitle: 'Belum ada data inventaris',
  emptyMessage: 'Data aset akan tampil sesuai filter laporan.',
  filters: ['search', 'roomId', 'status', 'condition', 'dateFrom', 'dateTo'],
  columns: [
    { key: 'inventory_number', label: 'Nomor Inventaris' },
    { key: 'name', label: 'Nama Aset' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'acquisition_date', label: 'Tanggal Perolehan', type: 'date' },
  ],
};

const usersByRole = [
  { id: 1, roleName: 'administrator', roleLabel: 'Administrator' },
  { id: 2, roleName: 'kepala_laboratorium', roleLabel: 'Kepala Laboratorium' },
  { id: 3, roleName: 'ketua_program_studi', roleLabel: 'Ketua Program Studi' },
  { id: 4, roleName: 'staf_administrasi', roleLabel: 'Staf Administrasi' },
  { id: 5, roleName: 'staf_laboratorium', roleLabel: 'Staf Laboratorium' },
].map((user) => ({
  ...user,
  fullName: user.roleLabel,
  email: `${user.roleName}@example.test`,
  username: user.roleName,
  roleId: user.id,
}));

async function loginAs(user) {
  authService.login.mockResolvedValueOnce(user);
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ identifier: user.username, password: 'password123' });
  return agent;
}

describe('Reports module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reportsService.listReportTypes.mockReturnValue([
      { type: 'assets', title: 'Laporan Inventaris', description: 'Daftar aset.' },
      { type: 'consumables', title: 'Laporan Stok BHP', description: 'Daftar BHP.' },
    ]);
    reportsService.getReportDefinition.mockReturnValue(reportDefinition);
    reportsService.listRooms.mockResolvedValue([{ id: 1, code: 'LAB-1', name: 'Laboratorium 1' }]);
    reportsService.listReportRows.mockResolvedValue({
      rows: [
        {
          inventory_number: 'INV-001',
          name: 'Mikroskop',
          status: 'active',
          acquisition_date: new Date('2026-05-22T00:00:00Z'),
        },
      ],
      total: 1,
    });
    reportsService.listReportExportRows.mockResolvedValue([
      {
        inventory_number: 'INV-001',
        name: 'Mikroskop',
        status: 'active',
        acquisition_date: new Date('2026-05-22T00:00:00Z'),
      },
    ]);
  });

  it('redirects anonymous users to login', async () => {
    const response = await request(app).get('/reports');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/auth/login');
  });

  it('allows all authenticated roles to open reports index', async () => {
    for (const user of usersByRole) {
      const agent = await loginAs(user);
      const response = await agent.get('/reports');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Pusat Laporan');
      expect(response.text).toContain('Laporan Inventaris');
    }
  });

  it('renders report rows', async () => {
    const agent = await loginAs(usersByRole[0]);

    const response = await agent.get('/reports/assets');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Laporan Inventaris');
    expect(response.text).toContain('INV-001');
    expect(response.text).toContain('Mikroskop');
  });

  it('renders empty report state', async () => {
    reportsService.listReportRows.mockResolvedValueOnce({ rows: [], total: 0 });
    const agent = await loginAs(usersByRole[0]);

    const response = await agent.get('/reports/assets');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Belum ada data inventaris');
  });

  it('passes filters to report service', async () => {
    const agent = await loginAs(usersByRole[0]);

    const response = await agent.get('/reports/assets').query({
      search: 'Mikroskop',
      roomId: '1',
      status: 'deleted',
      condition: 'damaged',
      dateFrom: '2026-01-01',
      dateTo: '2026-05-22',
    });

    expect(response.status).toBe(200);
    expect(reportsService.listReportRows).toHaveBeenCalledWith(
      'assets',
      expect.objectContaining({
        search: 'Mikroskop',
        roomId: '1',
        status: 'deleted',
        condition: 'damaged',
        dateFrom: '2026-01-01',
        dateTo: '2026-05-22',
      }),
      expect.objectContaining({ limit: 10, offset: 0 })
    );
  });

  it.each(['consumables', 'maintenance', 'procurement', 'receiving'])('renders %s report', async (reportType) => {
    const agent = await loginAs(usersByRole[0]);

    const response = await agent.get(`/reports/${reportType}`);

    expect(response.status).toBe(200);
    expect(reportsService.listReportRows).toHaveBeenCalledWith(
      reportType,
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('exports CSV with attachment headers', async () => {
    const agent = await loginAs(usersByRole[0]);

    const response = await agent.get('/reports/assets/export').query({ format: 'csv' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment; filename="laporan-assets-');
    expect(response.text).toContain('Nomor Inventaris,Nama Aset,Status,Tanggal Perolehan');
    expect(response.text).toContain('INV-001');
  });

  it('exports XLSX with attachment headers', async () => {
    const agent = await loginAs(usersByRole[0]);

    const response = await agent.get('/reports/assets/export').query({ format: 'xlsx' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(response.headers['content-disposition']).toContain('attachment; filename="laporan-assets-');
  });

  it('returns 400 for invalid export format', async () => {
    const agent = await loginAs(usersByRole[0]);

    const response = await agent.get('/reports/assets/export').query({ format: 'pdf' });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Format export tidak valid.');
  });

  it('returns 404 for invalid report type', async () => {
    reportsService.getReportDefinition.mockReturnValueOnce(null);
    const agent = await loginAs(usersByRole[0]);

    const response = await agent.get('/reports/unknown');

    expect(response.status).toBe(404);
  });
});
