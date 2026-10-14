const fs = require('fs');
const path = require('path');
const db = require('./db');

async function run() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await db.pool.query(schema);
    const migrationDir = path.join(__dirname, '..', 'db', 'migrations');
    for (const file of fs.readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort()) {
      await db.pool.query(fs.readFileSync(path.join(migrationDir, file), 'utf8'));
    }
    console.log('Migration applied successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

run();
