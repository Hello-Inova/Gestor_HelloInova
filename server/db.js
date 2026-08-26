// Camada de banco de dados (Postgres hospedado — ex: Neon, via a integração
// de Storage da própria Vercel).
//
// Este app rodava com SQLite local (node:sqlite) enquanto era hospedado num
// servidor tradicional. A Vercel, porém, roda o backend em funções
// "serverless": o sistema de arquivos é temporário e não é compartilhado
// entre instâncias, então um banco em arquivo (SQLite) perderia os dados a
// qualquer redeploy, reinício ou pico de tráfego. Por isso a camada de
// banco foi migrada para Postgres, acessado via a variável de ambiente
// DATABASE_URL.
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    'Variável de ambiente DATABASE_URL não configurada. Na Vercel, adicione um banco ' +
      'Postgres pela aba "Storage" do projeto (ela injeta DATABASE_URL automaticamente). ' +
      'Em desenvolvimento local, defina DATABASE_URL no arquivo .env.'
  );
}

// Bancos hospedados (Neon, Supabase, etc.) exigem SSL. "sslmode=disable" na
// connection string permite desligar isso explicitamente (ex: Postgres
// local sem TLS configurado).
const useSsl = !/sslmode=disable/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  // Erros em conexões ociosas do pool (ex: banco reiniciou) não devem
  // derrubar o processo — apenas logamos.
  console.error('[db] Erro inesperado numa conexão ociosa do pool:', err.message);
});

// Converte os placeholders "?" (estilo SQLite, usados em todo o restante do
// código) para o formato posicional "$1, $2, ..." exigido pelo driver do
// Postgres, para não precisar reescrever cada SQL espalhado pelas rotas.
function toPgQuery(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function query(sql, params) {
  return pool.query(toPgQuery(sql), params || []);
}

// Equivalentes assíncronos ao antigo db.prepare(sql).get/all/run(...params)
// do node:sqlite — mesma assinatura variádica, só que async.
async function get(sql, ...params) {
  const res = await query(sql, params);
  return res.rows[0];
}

async function all(sql, ...params) {
  const res = await query(sql, params);
  return res.rows;
}

async function run(sql, ...params) {
  const res = await query(sql, params);
  return { rows: res.rows, rowCount: res.rowCount };
}

// Schema completo (idempotente — seguro rodar em toda inicialização/cold
// start). Como esta é uma migração para um banco novo, o schema já nasce na
// versão final, sem o histórico de ALTER TABLE incremental que o SQLite
// precisou ao longo do tempo.
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    systems_seeded INTEGER NOT NULL DEFAULT 0,
    dashboard_seeded INTEGER NOT NULL DEFAULT 0,
    email_verified INTEGER NOT NULL DEFAULT 0,
    account_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS pages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'layout',
    type TEXT NOT NULL DEFAULT 'canvas',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS elements (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT DEFAULT '',
    x DOUBLE PRECISION NOT NULL DEFAULT 5,
    y DOUBLE PRECISION NOT NULL DEFAULT 5,
    width DOUBLE PRECISION NOT NULL DEFAULT 20,
    height DOUBLE PRECISION NOT NULL DEFAULT 8,
    font_size INTEGER NOT NULL DEFAULT 14,
    font_color TEXT NOT NULL DEFAULT '#EAF0FF',
    bg_color TEXT NOT NULL DEFAULT '#1657FF',
    border_radius INTEGER NOT NULL DEFAULT 8,
    font_weight TEXT NOT NULL DEFAULT '500',
    z_index INTEGER NOT NULL DEFAULT 1,
    placeholder TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS systems (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    repo_url TEXT DEFAULT '',
    login_email TEXT DEFAULT '',
    login_password_enc TEXT DEFAULT '',
    logo TEXT DEFAULT '',
    categories TEXT DEFAULT '[]',
    subscriptions TEXT DEFAULT '[]',
    contact_name TEXT DEFAULT '',
    contact_whatsapp TEXT DEFAULT '',
    contact_email TEXT DEFAULT '',
    contract_file TEXT DEFAULT '',
    contract_file_name TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Códigos de verificação por e-mail (cadastro e login em duas etapas).
  CREATE TABLE IF NOT EXISTS verification_codes (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL, -- 'register' | 'login'
    user_id INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Registro de tentativas de login por IP, usado para a trava de força bruta.
  CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,
    ip TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Tokens de recuperação de senha ("esqueci minha senha"), enviados por
  -- e-mail como link. Guardamos só o hash do token (nunca o valor em texto
  -- puro), como já é feito com os códigos de verificação.
  CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

// Numa função serverless cada "cold start" carrega este módulo do zero, mas
// instâncias "quentes" reaproveitam o mesmo processo — por isso cacheamos a
// promise de inicialização (readyPromise) em vez de rodar o CREATE TABLE a
// cada requisição.
let readyPromise = null;
function ready() {
  if (!readyPromise) {
    readyPromise = pool.query(SCHEMA_SQL).catch((err) => {
      readyPromise = null; // permite tentar de novo na próxima requisição
      throw err;
    });
  }
  return readyPromise;
}

module.exports = { pool, query, get, all, run, ready };
