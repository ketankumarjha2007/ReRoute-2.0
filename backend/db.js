const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'data', 'APS-09.db');
const db = new Database(dbPath, {
  // read/write mode
  readonly: false,
  fileMustExist: true
});

// Enable WAL mode for better concurrency and performance
try {
  db.pragma('journal_mode = WAL');
} catch (e) {
  // fallback if WAL cannot be set
}

module.exports = db;
