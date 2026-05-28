const request = require('supertest');
const app = require('../../app');

describe('GET /health', () => {
  it('returns application health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.app).toBeDefined();
    expect(response.body.timestamp).toBeDefined();
  });
});
