const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'data', 'APS-09.db');
const db = new Database(dbPath, {
  readonly: true,
  fileMustExist: true
});

module.exports = db;

