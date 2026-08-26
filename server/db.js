// Camada de banco de dados (SQLite nativo do Node.js)
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'helloinova.db');
const db = new DatabaseSync(DB_PATH);

// Observação: NÃO usamos "PRAGMA journal_mode = WAL" aqui de propósito.
// O WAL depende de um arquivo auxiliar (.db-shm) mapeado em memória, que é
// notoriamente instável quando o banco fica dentro de uma pasta sincronizada
// por OneDrive/Google Drive/Dropbox (como costuma ser "Desktop" no Windows) —
// o cliente de sincronização mexe nesse arquivo enquanto o SQLite o usa e
// isso gera erros como "disk I/O error", fazendo alterações (como editar um
// sistema) parecerem não salvar. O modo padrão (rollback journal) não usa
// esse arquivo e é muito mais tolerante a esse tipo de pasta.
db.exec(`
  PRAGMA journal_mode = DELETE;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    systems_seeded INTEGER NOT NULL DEFAULT 0,
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
    logo TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Migrações leves: adicionam colunas em bancos criados antes dessa versão.
// (SQLite não tem "ADD COLUMN IF NOT EXISTS", então tentamos e ignoramos o erro se já existir.)
const migrations = [
  "ALTER TABLE pages ADD COLUMN type TEXT NOT NULL DEFAULT 'canvas'",
  'ALTER TABLE users ADD COLUMN systems_seeded INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE systems ADD COLUMN logo TEXT DEFAULT ''",
  "ALTER TABLE systems ADD COLUMN categories TEXT DEFAULT '[]'",
  "ALTER TABLE systems ADD COLUMN subscription_name TEXT DEFAULT ''",
  'ALTER TABLE systems ADD COLUMN subscription_value REAL',
  "ALTER TABLE systems ADD COLUMN subscription_due_date TEXT DEFAULT ''",
  "ALTER TABLE systems ADD COLUMN subscriptions TEXT DEFAULT '[]'",
  "ALTER TABLE systems ADD COLUMN repo_url TEXT DEFAULT ''",
  "ALTER TABLE systems ADD COLUMN contact_name TEXT DEFAULT ''",
  "ALTER TABLE systems ADD COLUMN contact_whatsapp TEXT DEFAULT ''",
  "ALTER TABLE systems ADD COLUMN contact_email TEXT DEFAULT ''",
];
for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch (e) {
    // coluna já existe — ignora
  }
}

// Migra a antiga assinatura única (subscription_name/value/due_date) para a
// nova lista de assinaturas (coluna "subscriptions", suporta várias por
// sistema), preservando o que já existia.
try {
  const legacyRows = db
    .prepare(
      `SELECT id, subscription_name, subscription_value, subscription_due_date FROM systems
       WHERE (subscriptions IS NULL OR subscriptions = '[]')
         AND (COALESCE(subscription_name, '') != '' OR subscription_value IS NOT NULL OR COALESCE(subscription_due_date, '') != '')`
    )
    .all();
  for (const r of legacyRows) {
    const item = {
      name: r.subscription_name || '',
      value: r.subscription_value === undefined ? null : r.subscription_value,
      due_date: r.subscription_due_date || '',
    };
    db.prepare('UPDATE systems SET subscriptions = ? WHERE id = ?').run(JSON.stringify([item]), r.id);
  }
} catch (e) {
  // ignora se a tabela ainda não existir na primeira execução
}

// Contas que já tinham algum módulo do tipo "systems" antes da flag existir
// são marcadas como já semeadas, para não duplicar o módulo.
try {
  db.exec(`
    UPDATE users SET systems_seeded = 1
    WHERE systems_seeded = 0
      AND id IN (SELECT DISTINCT user_id FROM pages WHERE type = 'systems')
  `);
} catch (e) {
  // ignora se as tabelas ainda não existirem na primeira execução
}

module.exports = db;
