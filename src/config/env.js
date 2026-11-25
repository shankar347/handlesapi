const path = require('path');
const dotenv = require('dotenv');

// backend/.env (local) — Vercel injects process.env directly.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const parseList = (value, fallback = []) => {
  if (!value || typeof value !== 'string') {
    return fallback;
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

const mongodbUri =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  // Never default to localhost on Vercel — that causes findOne buffering timeouts.
  (isProduction ? '' : 'mongodb://127.0.0.1:27017/handles');

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  mongodbUri,
  corsOrigins: parseList(process.env.CORS_ORIGINS, [
    '*',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://192.168.53.187:8081',
  ]),
  host: process.env.HOST || '0.0.0.0',
  isProduction,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || '',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || '',
};

module.exports = env;
