const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./db');

const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/applications');
const helmet = require('helmet');

const app = express();
app.disable('x-powered-by');
app.use(bodyParser.json());
app.use(helmet());
app.use(cors({ origin: true }));

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api', appRoutes);

const port = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Ditsha API listening on port ${port}`);
  });
}

module.exports = app;
