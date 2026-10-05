const fs = require('fs');
const path = require('path');
const db = require('./db');

async function run() {
  const sql = fs.readFileSync(path.join(__dirname,'..','db','schema.sql'),'utf8');
  try {
    await db.pool.query(sql);
    console.log('Migration applied successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

run();
