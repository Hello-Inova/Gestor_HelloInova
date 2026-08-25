// Camada de banco de dados (SQLite nativo do Node.js)
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'helloinova.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'layout',
    type TEXT NOT NULL DEFAULT 'canvas',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS elements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    content TEXT DEFAULT '',
    x REAL NOT NULL DEFAULT 5,
    y REAL NOT NULL DEFAULT 5,
    width REAL NOT NULL DEFAULT 20,
    height REAL NOT NULL DEFAULT 8,
    font_size INTEGER NOT NULL DEFAULT 14,
    font_color TEXT NOT NULL DEFAULT '#EAF0FF',
    bg_color TEXT NOT NULL DEFAULT '#1657FF',
    border_radius INTEGER NOT NULL DEFAULT 8,
    font_weight TEXT NOT NULL DEFAULT '500',
    z_index INTEGER NOT NULL DEFAULT 1,
    placeholder TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS systems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    login_email TEXT DEFAULT '',
    login_password_enc TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Migração leve: adiciona a coluna "type" em bancos criados antes dessa versão.
try {
  db.exec("ALTER TABLE pages ADD COLUMN type TEXT NOT NULL DEFAULT 'canvas'");
} catch (e) {
  // coluna já existe — ignora
}

module.exports = db;
