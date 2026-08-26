const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { encrypt, decrypt } = require('../crypto');
const { SYSTEM_CATEGORIES } = require('../categories');

const router = express.Router();
router.use(requireAuth);

const MAX_LOGO_LENGTH = 1_500_000; // ~1.1MB de imagem original (base64 infla ~33%)
const MAX_CONTRACT_LENGTH = 7_000_000; // ~5.2MB de arquivo original (base64 infla ~33%)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toPublic(row) {
  let categories = [];
  try {
    const parsed = JSON.parse(row.categories || '[]');
    if (Array.isArray(parsed)) categories = parsed.filter((c) => SYSTEM_CATEGORIES.includes(c));
  } catch (e) { /* categorias inválidas — trata como vazio */ }

  let subscriptions = [];
  try {
    const parsed = JSON.parse(row.subscriptions || '[]');
    if (Array.isArray(parsed)) {
      subscriptions = parsed.map((s) => ({
        name: typeof s.name === 'string' ? s.name : '',
        value: typeof s.value === 'number' ? s.value : (s.value === null || s.value === undefined ? null : Number(s.value)),
        due_date: typeof s.due_date === 'string' ? s.due_date : '',
      }));
    }
  } catch (e) { /* assinaturas inválidas — trata como vazio */ }

  const subscriptionsTotalValue = subscriptions.reduce((sum, s) => sum + (typeof s.value === 'number' && !isNaN(s.value) ? s.value : 0), 0);

  return {
    id: row.id,
    name: row.name,
    url: row.url,
    repo_url: row.repo_url || '',
    login_email: row.login_email,
    has_password: !!row.login_password_enc,
    logo: row.logo || '',
    categories,
    subscriptions,
    subscriptions_total_count: subscriptions.length,
    subscriptions_total_value: subscriptionsTotalValue,
    contact_name: row.contact_name || '',
    contact_whatsapp: row.contact_whatsapp || '',
    contact_email: row.contact_email || '',
    contract_file: row.contract_file || '',
    contract_file_name: row.contract_file_name || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getOwned(id, accountId) {
  return db.prepare('SELECT * FROM systems WHERE id = ? AND user_id = ?').get(id, accountId);
}

function validLogo(logo) {
  if (!logo) return true;
  if (typeof logo !== 'string') return false;
  if (logo.length > MAX_LOGO_LENGTH) return false;
  return /^data:image\//.test(logo);
}

function validContractFile(file) {
  if (!file) return true;
  if (typeof file !== 'string') return false;
  if (file.length > MAX_CONTRACT_LENGTH) return false;
  return /^data:(application\/pdf|image\/)/.test(file);
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

// Normaliza e valida a lista de assinaturas vinda do cliente.
// Cada item: { name, value, due_date }. Retorna { ok, subscriptions, error }.
function parseSubscriptions(input) {
  if (input === undefined) return { ok: true, subscriptions: undefined };
  if (!Array.isArray(input)) return { ok: false, error: 'Lista de assinaturas inválida.' };
  if (input.length > 200) return { ok: false, error: 'Número de assinaturas excede o limite permitido.' };

  const subscriptions = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'Assinatura inválida.' };

    const name = typeof item.name === 'string' ? item.name.trim() : '';

    let value = null;
    if (item.value !== undefined && item.value !== null && item.value !== '') {
      const num = Number(item.value);
      if (!Number.isFinite(num) || num < 0) return { ok: false, error: 'Informe um valor de assinatura válido.' };
      value = num;
    }

    let due_date = '';
    if (item.due_date) {
      if (typeof item.due_date !== 'string' || !DATE_RE.test(item.due_date)) {
        return { ok: false, error: 'Informe uma data de vencimento válida.' };
      }
      due_date = item.due_date;
    }

    // Ignora linhas totalmente vazias (ex: uma linha adicionada e não preenchida).
    if (!name && value === null && !due_date) continue;

    subscriptions.push({ name, value, due_date });
  }
  return { ok: true, subscriptions };
}

// Valida os dados de contato do responsável pelo contrato.
// Retorna { ok, contact_name, contact_whatsapp, contact_email, error }.
function parseContact(contact_name, contact_whatsapp, contact_email) {
  const name = typeof contact_name === 'string' ? contact_name.trim() : '';
  const whatsapp = typeof contact_whatsapp === 'string' ? contact_whatsapp.trim() : '';
  const emailRaw = typeof contact_email === 'string' ? contact_email.trim() : '';

  if (name.length > 120) return { ok: false, error: 'Nome do responsável muito longo.' };
  if (whatsapp.length > 30) return { ok: false, error: 'WhatsApp do responsável inválido.' };
  if (emailRaw && !EMAIL_RE.test(emailRaw)) return { ok: false, error: 'Informe um e-mail de contato válido.' };

  return { ok: true, contact_name: name, contact_whatsapp: whatsapp, contact_email: emailRaw };
}

// Lista as categorias/tipos de sistema disponíveis para o select do cadastro
router.get('/categories', (req, res) => {
  res.json({ categories: SYSTEM_CATEGORIES });
});

// Lista sistemas cadastrados (sem a senha em texto puro)
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM systems WHERE user_id = ? ORDER BY id DESC')
    .all(req.user.account_id);
  res.json({ systems: rows.map(toPublic) });
});

// Cadastra um novo sistema
router.post('/', (req, res) => {
  const {
    name, url, repo_url = '', login_email = '', login_password = '', logo = '',
    categories, subscriptions,
    contact_name = '', contact_whatsapp = '', contact_email = '',
    contract_file = '', contract_file_name = '',
  } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome do sistema.' });
  if (!url || !url.trim()) return res.status(400).json({ error: 'Informe o link de acesso.' });
  if (!validLogo(logo)) return res.status(400).json({ error: 'Logo inválida ou muito grande (máx. ~1MB).' });
  if (!validContractFile(contract_file)) {
    return res.status(400).json({ error: 'Anexo de contrato inválido ou muito grande (máx. ~5MB, PDF ou imagem).' });
  }

  const cat = parseCategories(categories);
  if (!cat.ok) return res.status(400).json({ error: cat.error });
  const subs = parseSubscriptions(subscriptions);
  if (!subs.ok) return res.status(400).json({ error: subs.error });
  const contact = parseContact(contact_name, contact_whatsapp, contact_email);
  if (!contact.ok) return res.status(400).json({ error: contact.error });

  const info = db
    .prepare(
      `INSERT INTO systems
        (user_id, name, url, repo_url, login_email, login_password_enc, logo, categories, subscriptions,
         contact_name, contact_whatsapp, contact_email, contract_file, contract_file_name)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      req.user.account_id, name.trim(), url.trim(), (repo_url || '').trim(), login_email.trim(), encrypt(login_password), logo,
      JSON.stringify(cat.categories || []), JSON.stringify(subs.subscriptions || []),
      contact.contact_name, contact.contact_whatsapp, contact.contact_email,
      contract_file || '', (contract_file_name || '').trim().slice(0, 200)
    );

  const row = db.prepare('SELECT * FROM systems WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ system: toPublic(row) });
});

// Atualiza um sistema
router.put('/:id', (req, res) => {
  const row = getOwned(req.params.id, req.user.account_id);
  if (!row) return res.status(404).json({ error: 'Sistema não encontrado.' });

  const {
    name, url, repo_url, login_email, login_password, logo,
    categories, subscriptions,
    contact_name, contact_whatsapp, contact_email,
    contract_file, contract_file_name,
  } = req.body || {};
  if (logo !== undefined && !validLogo(logo)) {
    return res.status(400).json({ error: 'Logo inválida ou muito grande (máx. ~1MB).' });
  }
  if (contract_file !== undefined && !validContractFile(contract_file)) {
    return res.status(400).json({ error: 'Anexo de contrato inválido ou muito grande (máx. ~5MB, PDF ou imagem).' });
  }
  const cat = parseCategories(categories);
  if (!cat.ok) return res.status(400).json({ error: cat.error });
  const subs = parseSubscriptions(subscriptions);
  if (!subs.ok) return res.status(400).json({ error: subs.error });
  const contact = parseContact(
    contact_name === undefined ? row.contact_name : contact_name,
    contact_whatsapp === undefined ? row.contact_whatsapp : contact_whatsapp,
    contact_email === undefined ? row.contact_email : contact_email
  );
  if (!contact.ok) return res.status(400).json({ error: contact.error });

  const newName = typeof name === 'string' && name.trim() ? name.trim() : row.name;
  const newUrl = typeof url === 'string' && url.trim() ? url.trim() : row.url;
  const newRepoUrl = typeof repo_url === 'string' ? repo_url.trim() : row.repo_url;
  const newEmail = typeof login_email === 'string' ? login_email.trim() : row.login_email;
  const newPassEnc =
    typeof login_password === 'string' && login_password !== '' ? encrypt(login_password) : row.login_password_enc;
  const newLogo = typeof logo === 'string' ? logo : row.logo;
  const newCategories = cat.categories === undefined ? row.categories : JSON.stringify(cat.categories);
  const newSubscriptions = subs.subscriptions === undefined ? row.subscriptions : JSON.stringify(subs.subscriptions);
  const newContractFile = typeof contract_file === 'string' ? contract_file : row.contract_file;
  const newContractFileName =
    typeof contract_file_name === 'string' ? contract_file_name.trim().slice(0, 200) : row.contract_file_name;

  db.prepare(
    `UPDATE systems SET name=?, url=?, repo_url=?, login_email=?, login_password_enc=?, logo=?,
       categories=?, subscriptions=?, contact_name=?, contact_whatsapp=?, contact_email=?,
       contract_file=?, contract_file_name=?,
       updated_at=datetime('now') WHERE id=?`
  ).run(
    newName, newUrl, newRepoUrl, newEmail, newPassEnc, newLogo, newCategories, newSubscriptions,
    contact.contact_name, contact.contact_whatsapp, contact.contact_email,
    newContractFile, newContractFileName, row.id
  );

  const updated = db.prepare('SELECT * FROM systems WHERE id = ?').get(row.id);
  res.json({ system: toPublic(updated) });
});

// Exclui um sistema
router.delete('/:id', (req, res) => {
  const row = getOwned(req.params.id, req.user.account_id);
  if (!row) return res.status(404).json({ error: 'Sistema não encontrado.' });
  db.prepare('DELETE FROM systems WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// Revela as credenciais em texto puro (usado só no momento do "Login As")
router.get('/:id/reveal', (req, res) => {
  const row = getOwned(req.params.id, req.user.account_id);
  if (!row) return res.status(404).json({ error: 'Sistema não encontrado.' });
  res.json({
    url: row.url,
    login_email: row.login_email,
    login_password: decrypt(row.login_password_enc),
  });
});

module.exports = router;
