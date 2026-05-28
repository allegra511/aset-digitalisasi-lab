describe('Application config hardening', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects production with the default session secret', () => {
    process.env.APP_ENV = 'production';
    process.env.APP_SESSION_SECRET = 'change-this-session-secret';

    expect(() => require('../../config/app')).toThrow('APP_SESSION_SECRET wajib diisi');
  });

  it('allows production with a custom session secret', () => {
    process.env.APP_ENV = 'production';
    process.env.APP_SESSION_SECRET = 'a-long-random-production-secret';
    process.env.APP_TRUST_PROXY = 'true';

    const config = require('../../config/app');

    expect(config.env).toBe('production');
    expect(config.session.secret).toBe('a-long-random-production-secret');
    expect(config.trustProxy).toBe(true);
  });
});
