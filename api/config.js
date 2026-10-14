const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET;

if (isProduction && (!jwtSecret || jwtSecret.length < 32 || jwtSecret === 'your-secret-key-here')) {
  throw new Error('JWT_SECRET must be a unique value of at least 32 characters in production');
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

module.exports = {
  isProduction,
  jwtSecret: jwtSecret || 'dev-secret',
  port: Number(process.env.PORT || 3000),
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000',
  trustProxy: process.env.TRUST_PROXY === 'true',
};
