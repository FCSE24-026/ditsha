const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const db = require('./db');
const config = require('./config');

const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/applications');
const adminRoutes = require('./routes/admin');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

// ── Request ID ─────────────────────────────────────────────────────────────
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

// ── Health / readiness ─────────────────────────────────────────────────────
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

// ── SSE: real-time officer queue updates ───────────────────────────────────
// Officers subscribe to GET /api/sse/officer-queue with their Bearer token.
// The server pushes a "queue_updated" event whenever an application status or
// assignment changes.  Clients should refetch the queue on receiving this event.
// This is a documented polling-safe fallback: if SSE drops, clients fall back
// to a 30-second interval poll.

/** @type {Map<string, Set<import('http').ServerResponse>>} */
const officerSseClients = new Map(); // land_board_id → Set of response objects

function broadcastQueueUpdate(landBoardId) {
  const clients = officerSseClients.get(landBoardId);
  if (!clients || clients.size === 0) return;
  const data = JSON.stringify({ event: 'queue_updated', land_board_id: landBoardId, timestamp: new Date().toISOString() });
  for (const client of clients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      clients.delete(client);
    }
  }
}

// Expose broadcaster so routes can call it after DB commits
app.locals.broadcastQueueUpdate = broadcastQueueUpdate;

app.get('/api/sse/officer-queue', (req, res) => {
  // Authenticate
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/, '');
  let payload;
  try {
    payload = jwt.verify(auth, config.jwtSecret);
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
  if (payload.role !== 'officer') return res.status(403).json({ message: 'Officer access required' });

  const landBoardId = payload.land_board_id;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send a heartbeat comment every 25 seconds to keep the connection alive
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  if (!officerSseClients.has(landBoardId)) officerSseClients.set(landBoardId, new Set());
  officerSseClients.get(landBoardId).add(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    officerSseClients.get(landBoardId)?.delete(res);
  });
});

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api', appRoutes);
app.use('/api/admin', adminRoutes);

// ── Error handler ──────────────────────────────────────────────────────────
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

// ── Server startup ─────────────────────────────────────────────────────────
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
