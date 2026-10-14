const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const db = require('./db');
const config = require('./config');

const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/applications');
const helmet = require('helmet');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use((req, res, next) => {
  const requestId = req.get('x-request-id') || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});
app.use(express.json({ limit: '1mb', strict: true }));
app.use(helmet());
const allowedOrigins = config.corsOrigins.length
  ? config.corsOrigins
  : ['http://localhost:5173', 'http://localhost:5177', 'http://localhost:8081'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed'));
  },
  credentials: true,
}));

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', request_id: req.requestId });
  }
});

app.get('/api/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (err) {
    console.error('Readiness check failed:', err);
    res.status(503).json({ status: 'not_ready', request_id: req.requestId });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api', appRoutes);
app.use((err, req, res, next) => {
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_UNEXPECTED_FILE')) {
    return res.status(400).json({ message: 'Invalid document upload. Use PDF, JPEG, or PNG files up to 10MB.' });
  }
  if (err && err.message === 'Origin is not allowed') {
    return res.status(403).json({ message: 'Origin is not allowed', request_id: req.requestId });
  }
  console.error(err);
  return res.status(500).json({ message: 'Internal server error', request_id: req.requestId });
});

const port = config.port;

if (require.main === module) {
  const server = app.listen(port, () => {
    console.log(`Ditsha API listening on port ${port}`);
  });
  const shutdown = async (signal) => {
    console.log(`${signal} received; shutting down`);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
