// Copy the SQLite database to data/backups/app-YYYY-MM-DD.db and keep 14 days.
// Cron example: 15 3 * * * cd /path/to/app && node scripts/backup.mjs
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dbPath = process.env.DB_PATH || './data/app.db';
const dir = path.join(path.dirname(dbPath), 'backups');
fs.mkdirSync(dir, { recursive: true });
const target = path.join(dir, `app-${new Date().toISOString().slice(0, 10)}.db`);
fs.rmSync(target, { force: true });
new DatabaseSync(dbPath).exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
for (const f of fs.readdirSync(dir)) {
  const p = path.join(dir, f);
  if (Date.now() - fs.statSync(p).mtimeMs > 14 * 86400_000) fs.rmSync(p);
}
console.log('backup ok:', target);
