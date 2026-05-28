const DEFAULT_SESSION_SECRET = 'change-this-session-secret';
const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development';
const sessionSecret = process.env.APP_SESSION_SECRET || DEFAULT_SESSION_SECRET;

if (appEnv === 'production' && sessionSecret === DEFAULT_SESSION_SECRET) {
  throw new Error('APP_SESSION_SECRET wajib diisi dengan secret kuat untuk production.');
}

module.exports = {
  name: process.env.APP_NAME || 'Labora',
  env: appEnv,
  port: Number(process.env.APP_PORT || process.env.PORT || 3000),
  trustProxy: ['1', 'true', 'yes'].includes(String(process.env.APP_TRUST_PROXY || '').toLowerCase()),
  session: {
    name: process.env.APP_SESSION_NAME || 'lab_asset_session',
    secret: sessionSecret,
    maxAge: Number(process.env.APP_SESSION_MAX_AGE || 24 * 60 * 60 * 1000),
  },
};
