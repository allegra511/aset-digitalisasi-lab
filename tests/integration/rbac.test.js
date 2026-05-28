const express = require('express');
const request = require('supertest');
const { requireRole } = require('../../src/middlewares');

function createRbacTestApp(roleName) {
  const app = express();

  app.get(
    '/admin-only',
    (req, res, next) => {
      req.session = {
        user: {
          roleName,
        },
      };
      next();
    },
    requireRole('administrator'),
    (req, res) => {
      res.json({ ok: true });
    }
  );

  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({
      message: err.message,
    });
  });

  return app;
}

describe('RBAC middleware', () => {
  it('allows the correct role', async () => {
    const app = createRbacTestApp('administrator');

    const response = await request(app).get('/admin-only');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it('rejects a wrong role', async () => {
    const app = createRbacTestApp('staf_laboratorium');

    const response = await request(app).get('/admin-only');

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Anda tidak memiliki akses ke halaman ini.');
  });
});
