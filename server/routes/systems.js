const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { encrypt, decrypt } = require('../crypto');

const router = express.Router();
router.use(requireAuth);

const MAX_LOGO_LENGTH = 1_500_000; // ~1.1MB de imagem original (base64 infla ~33%)

const SYSTEM_CATEGORIES = ['Web Site', 'Landing Page', 'Catálogo Digital', 'ERP', 'SAAS'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toPublic(row) {
  let categories = [];
  try {
    const parsed = JSON.parse(row.categories || '[]');
    if (Array.isArray(parsed)) categories = parsed.filter((c) => SYSTEM_CATEGORIES.includes(c));
  } catch (e) { /* categorias inválidas — trata como vazio */ }

  return {
    id: row.id,
    name: row.name,
    url: row.url,
    login_email: row.login_email,
    has_password: !!row.login_password_enc,
    logo: row.logo || '',
    categories,
    subscription_name: row.subscription_name || '',
    subscription_value: row.subscription_value === undefined ? null : row.subscription_value,
    subscription_due_date: row.subscription_due_date || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getOwned(id, userId) {
  return db.prepare('SELECT * FROM systems WHERE id = ? AND user_id = ?').get(id, userId);
}

function validLogo(logo) {
  if (!logo) return true;
  if (typeof logo !== 'string') return false;
  if (logo.length > MAX_LOGO_LENGTH) return false;
  return /^data:image\//.test(logo);
}

// Normaliza e valida a lista de categorias vinda do cliente.
// Retorna { ok, categories, error }.
function parseCategories(input) {
  if (input === undefined) return { ok: true, categories: undefined };
  if (!Array.isArray(input)) return { ok: false, error: 'Categorias inválidas.' };
  const unique = [...new Set(input)];
  if (!unique.every((c) => typeof c === 'string' && SYSTEM_CATEGORIES.includes(c))) {
    return { ok: false, error: 'Selecione apenas opções válidas de tipo de sistema.' };
  }
  return { ok: true, categories: unique };
}

// Normaliza e valida o valor monetário da assinatura (aceita null/undefined para "sem valor").
function parseSubscriptionValue(input) {
  if (input === undefined) return { ok: true, value: undefined };
  if (input === null || input === '') return { ok: true, value: null };
  const num = Number(input);
  if (!Number.isFinite(num) || num < 0) return { ok: false, error: 'Informe um valor de assinatura válido.' };
  return { ok: true, value: num };
}

function parseSubscriptionDate(input) {
  if (input === undefined) return { ok: true, date: undefined };
  if (input === null || input === '') return { ok: true, date: '' };
  if (typeof input !== 'string' || !DATE_RE.test(input)) return { ok: false, error: 'Informe uma data de vencimento válida.' };
  return { ok: true, date: input };
}

// Lista as categorias/tipos de sistema disponíveis para o select do cadastro
router.get('/categories', (req, res) => {
  res.json({ categories: SYSTEM_CATEGORIES });
});

// Lista sistemas cadastrados (sem a senha em texto puro)
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM systems WHERE user_id = ? ORDER BY id DESC')
    .all(req.user.id);
  res.json({ systems: rows.map(toPublic) });
});

// Cadastra um novo sistema
router.post('/', (req, res) => {
  const {
    name, url, login_email = '', login_password = '', logo = '',
    categories, subscription_name = '', subscription_value, subscription_due_date,
  } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome do sistema.' });
  if (!url || !url.trim()) return res.status(400).json({ error: 'Informe o link de acesso.' });
  if (!validLogo(logo)) return res.status(400).json({ error: 'Logo inválida ou muito grande (máx. ~1MB).' });

  const cat = parseCategories(categories);
  if (!cat.ok) return res.status(400).json({ error: cat.error });
  const subVal = parseSubscriptionValue(subscription_value);
  if (!subVal.ok) return res.status(400).json({ error: subVal.error });
  const subDate = parseSubscriptionDate(subscription_due_date);
  if (!subDate.ok) return res.status(400).json({ error: subDate.error });

  const info = db
    .prepare(
      `INSERT INTO systems
        (user_id, name, url, login_email, login_password_enc, logo, categories, subscription_name, subscription_value, subscription_due_date)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      req.user.id, name.trim(), url.trim(), login_email.trim(), encrypt(login_password), logo,
      JSON.stringify(cat.categories || []), (subscription_name || '').trim(),
      subVal.value === undefined ? null : subVal.value, subDate.date === undefined ? '' : subDate.date
    );

  const row = db.prepare('SELECT * FROM systems WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ system: toPublic(row) });
});

// Atualiza um sistema
router.put('/:id', (req, res) => {
  const row = getOwned(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Sistema não encontrado.' });

  const {
    name, url, login_email, login_password, logo,
    categories, subscription_name, subscription_value, subscription_due_date,
  } = req.body || {};
  if (logo !== undefined && !validLogo(logo)) {
    return res.status(400).json({ error: 'Logo inválida ou muito grande (máx. ~1MB).' });
  }
  const cat = parseCategories(categories);
  if (!cat.ok) return res.status(400).json({ error: cat.error });
  const subVal = parseSubscriptionValue(subscription_value);
  if (!subVal.ok) return res.status(400).json({ error: subVal.error });
  const subDate = parseSubscriptionDate(subscription_due_date);
  if (!subDate.ok) return res.status(400).json({ error: subDate.error });

  const newName = typeof name === 'string' && name.trim() ? name.trim() : row.name;
  const newUrl = typeof url === 'string' && url.trim() ? url.trim() : row.url;
  const newEmail = typeof login_email === 'string' ? login_email.trim() : row.login_email;
  const newPassEnc =
    typeof login_password === 'string' && login_password !== '' ? encrypt(login_password) : row.login_password_enc;
  const newLogo = typeof logo === 'string' ? logo : row.logo;
  const newCategories = cat.categories === undefined ? row.categories : JSON.stringify(cat.categories);
  const newSubName = typeof subscription_name === 'string' ? subscription_name.trim() : row.subscription_name;
  const newSubValue = subVal.value === undefined ? row.subscription_value : subVal.value;
  const newSubDate = subDate.date === undefined ? row.subscription_due_date : subDate.date;

  db.prepare(
    `UPDATE systems SET name=?, url=?, login_email=?, login_password_enc=?, logo=?,
       categories=?, subscription_name=?, subscription_value=?, subscription_due_date=?,
       updated_at=datetime('now') WHERE id=?`
  ).run(newName, newUrl, newEmail, newPassEnc, newLogo, newCategories, newSubName, newSubValue, newSubDate, row.id);

  const updated = db.prepare('SELECT * FROM systems WHERE id = ?').get(row.id);
  res.json({ system: toPublic(updated) });
});

// Exclui um sistema
router.delete('/:id', (req, res) => {
  const row = getOwned(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Sistema não encontrado.' });
  db.prepare('DELETE FROM systems WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// Revela as credenciais em texto puro (usado só no momento do "Login As")
router.get('/:id/reveal', (req, res) => {
  const row = getOwned(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Sistema não encontrado.' });
  res.json({
    url: row.url,
    login_email: row.login_email,
    login_password: decrypt(row.login_password_enc),
  });
});

module.exports = router;
