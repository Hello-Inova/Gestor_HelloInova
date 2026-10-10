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
    module_permissions TEXT NOT NULL DEFAULT '[]',
    systems_seeded INTEGER NOT NULL DEFAULT 0,
    dashboard_seeded INTEGER NOT NULL DEFAULT 0,
    leads_seeded INTEGER NOT NULL DEFAULT 0,
    candidates_seeded INTEGER NOT NULL DEFAULT 0,
    public_sites_seeded INTEGER NOT NULL DEFAULT 0,
    catalog_seeded INTEGER NOT NULL DEFAULT 0,
    public_slug TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    account_id INTEGER,
    session_version INTEGER NOT NULL DEFAULT 0,
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
    documentation_files TEXT DEFAULT '[]',
    links TEXT DEFAULT '[]',
    specifications TEXT DEFAULT '',
    is_public INTEGER NOT NULL DEFAULT 0,
    niche TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- "CREATE TABLE IF NOT EXISTS" acima não adiciona colunas novas a uma
  -- tabela que já existe (ex: produção, com sistemas já cadastrados) — por
  -- isso colunas adicionadas depois da criação inicial da tabela precisam de
  -- um ALTER TABLE explícito e idempotente como este.
  ALTER TABLE systems ADD COLUMN IF NOT EXISTS documentation_files TEXT DEFAULT '[]';
  ALTER TABLE systems ADD COLUMN IF NOT EXISTS links TEXT DEFAULT '[]';
  ALTER TABLE systems ADD COLUMN IF NOT EXISTS specifications TEXT DEFAULT '';
  ALTER TABLE systems ADD COLUMN IF NOT EXISTS is_public INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE systems ADD COLUMN IF NOT EXISTS niche TEXT DEFAULT '';

  -- Mesma lógica: "users" já existia em produção antes do módulo de Leads,
  -- então a coluna de seeding precisa do ALTER TABLE idempotente também.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS leads_seeded INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS candidates_seeded INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS public_sites_seeded INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS catalog_seeded INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS public_slug TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS module_permissions TEXT NOT NULL DEFAULT '[]';
  UPDATE users
     SET public_slug = md5(random()::text || clock_timestamp()::text || id::text)
   WHERE public_slug IS NULL OR public_slug = '';
  CREATE UNIQUE INDEX IF NOT EXISTS users_public_slug_unique ON users(public_slug);

  CREATE TABLE IF NOT EXISTS system_taxonomies (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('category', 'niche')),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, kind, name)
  );

  -- Leads captados pelo formulário público (public/captacao.html). Tabela
  -- sem "user_id"/"account_id": o formulário público não tem contexto de
  -- autenticação para atribuir o lead a uma conta específica, então os
  -- leads formam uma caixa de entrada única, compartilhada por todas as
  -- contas do Gestor (mesmo modelo do restante do app hoje, que é
  -- essencialmente mono-tenant).
  CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    email TEXT NOT NULL,
    services TEXT DEFAULT '[]',
    business_segment TEXT DEFAULT '',
    business_segment_other TEXT DEFAULT '',
    description TEXT DEFAULT '',
    referrer_url TEXT DEFAULT '',
    source TEXT DEFAULT '',
    step_completed INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'novo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS public_token_hash TEXT;
  CREATE INDEX IF NOT EXISTS leads_public_token_hash_idx ON leads(public_token_hash);

  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    details TEXT DEFAULT '',
    observations TEXT DEFAULT '',
    price NUMERIC(12,2),
    price_details TEXT DEFAULT '',
    logo TEXT DEFAULT '',
    images TEXT NOT NULL DEFAULT '[]',
    is_public INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS products_user_id_idx ON products(user_id);
  ALTER TABLE products ADD COLUMN IF NOT EXISTS logo TEXT DEFAULT '';

  CREATE TABLE IF NOT EXISTS product_catalog_links (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
  );
  CREATE INDEX IF NOT EXISTS product_catalog_links_user_id_idx ON product_catalog_links(user_id);
  ALTER TABLE products ADD COLUMN IF NOT EXISTS detail_link_id INTEGER REFERENCES product_catalog_links(id) ON DELETE SET NULL;

  -- Candidatos à vaga de SDR recebidos pelo formulário público externo.
  -- Mantemos os dados de recrutamento separados dos leads comerciais para
  -- que cada módulo tenha seu próprio fluxo e status.
  CREATE TABLE IF NOT EXISTS candidates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    email TEXT NOT NULL,
    location TEXT NOT NULL,
    instagram_url TEXT NOT NULL,
    prospecting_experience TEXT NOT NULL,
    desired_commission NUMERIC(5,2) NOT NULL,
    motivation TEXT NOT NULL,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source TEXT NOT NULL DEFAULT 'formulario_sdr',
    status TEXT NOT NULL DEFAULT 'novo',
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

  CREATE TABLE IF NOT EXISTS request_rate_limits (
    id BIGSERIAL PRIMARY KEY,
    route TEXT NOT NULL,
    client_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS request_rate_limits_lookup_idx
    ON request_rate_limits(route, client_key, created_at);

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
