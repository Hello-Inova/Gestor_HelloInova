const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { encrypt, decrypt } = require('../crypto');
const { SYSTEM_CATEGORIES } = require('../categories');
const { normalizeHttpUrl, isAllowedImageDataUrl } = require('../security');

const router = express.Router();
router.use(requireAuth);

// Express 4 não encaminha automaticamente rejeições de handlers async para o
// middleware de erro — sem isso, um erro depois de um "await" faria a
// requisição travar sem resposta.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const MAX_LOGO_LENGTH = 1_500_000; // ~1.1MB de imagem original (base64 infla ~33%)
const MAX_CONTRACT_LENGTH = 7_000_000; // ~5.2MB de arquivo original (base64 infla ~33%)
const MAX_DOC_FILE_LENGTH = 7_000_000; // ~5.2MB por PDF (base64 infla ~33%)
const MAX_DOC_FILES = 10; // limite de anexos na "Documentação Sistêmica"
const MAX_LINKS = 30; // limite de links adicionais por sistema

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toPublic(row) {
  let categories = [];
  try {
    const parsed = JSON.parse(row.categories || '[]');
    if (Array.isArray(parsed)) categories = parsed.filter((c) => typeof c === 'string');
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

  let documentationFiles = [];
  try {
    const parsed = JSON.parse(row.documentation_files || '[]');
    if (Array.isArray(parsed)) {
      documentationFiles = parsed
        .filter((d) => d && typeof d.data === 'string')
        .map((d) => ({ name: typeof d.name === 'string' ? d.name : '', data: d.data }));
    }
  } catch (e) { /* documentação inválida — trata como vazia */ }

  let links = [];
  try {
    const parsed = JSON.parse(row.links || '[]');
    if (Array.isArray(parsed)) {
      links = parsed
        .filter((l) => l && (typeof l.name === 'string' || typeof l.url === 'string'))
        .map((l) => ({ name: typeof l.name === 'string' ? l.name : '', url: typeof l.url === 'string' ? l.url : '' }));
    }
  } catch (e) { /* links inválidos — trata como vazio */ }

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
    documentation_files: documentationFiles,
    links,
    specifications: row.specifications || '',
    is_public: !!row.is_public,
    niche: row.niche || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getOwned(id, accountId) {
  return db.get('SELECT * FROM systems WHERE id = ? AND user_id = ?', id, accountId);
}

function validLogo(logo) {
  if (!logo) return true;
  if (typeof logo !== 'string') return false;
  if (logo.length > MAX_LOGO_LENGTH) return false;
  return isAllowedImageDataUrl(logo);
}

function validContractFile(file) {
  if (!file) return true;
  if (typeof file !== 'string') return false;
  if (file.length > MAX_CONTRACT_LENGTH) return false;
  return /^data:application\/pdf;base64,/i.test(file) || isAllowedImageDataUrl(file);
}

// Normaliza e valida a lista de anexos da "Documentação Sistêmica" (só
// PDF, vários arquivos por sistema). Retorna { ok, files, error }.
function parseDocumentationFiles(input) {
  if (input === undefined) return { ok: true, files: undefined };
  if (!Array.isArray(input)) return { ok: false, error: 'Documentação sistêmica inválida.' };
  if (input.length > MAX_DOC_FILES) {
    return { ok: false, error: `Você pode anexar no máximo ${MAX_DOC_FILES} arquivos na documentação sistêmica.` };
  }

  const files = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'Anexo de documentação inválido.' };
    const data = typeof item.data === 'string' ? item.data : '';
    if (!data) continue; // ignora entradas vazias
    if (data.length > MAX_DOC_FILE_LENGTH || !/^data:application\/pdf/.test(data)) {
      return { ok: false, error: 'Cada arquivo da documentação sistêmica deve ser um PDF de até ~5MB.' };
    }
    const name = (typeof item.name === 'string' ? item.name : '').trim().slice(0, 200) || 'documento.pdf';
    files.push({ name, data });
  }
  return { ok: true, files };
}

// Normaliza e valida a lista de "Links adicionais" (nome + URL livres,
// além do link de acesso e do repositório). Retorna { ok, links, error }.
function parseLinks(input) {
  if (input === undefined) return { ok: true, links: undefined };
  if (!Array.isArray(input)) return { ok: false, error: 'Lista de links inválida.' };
  if (input.length > MAX_LINKS) {
    return { ok: false, error: `Você pode adicionar no máximo ${MAX_LINKS} links.` };
  }

  const links = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'Link inválido.' };
    const name = (typeof item.name === 'string' ? item.name : '').trim().slice(0, 120);
    const rawUrl = (typeof item.url === 'string' ? item.url : '').trim();
    if (!name && !rawUrl) continue; // ignora linhas totalmente vazias
    const url = normalizeHttpUrl(rawUrl);
    if (!url) return { ok: false, error: 'Cada link adicional deve ter uma URL HTTP ou HTTPS válida.' };
    links.push({ name, url });
  }
  return { ok: true, links };
}

// Normaliza e valida a lista de categorias vinda do cliente.
// Retorna { ok, categories, error }.
async function ensureTaxonomies(accountId) {
  for (const name of SYSTEM_CATEGORIES) {
    await db.run(
      `INSERT INTO system_taxonomies (account_id, kind, name)
       VALUES (?, 'category', ?) ON CONFLICT (account_id, kind, name) DO NOTHING`,
      accountId,
      name
    );
  }
}

async function parseCategories(input, accountId) {
  if (input === undefined) return { ok: true, categories: undefined };
  if (!Array.isArray(input)) return { ok: false, error: 'Categorias inválidas.' };
  const unique = [...new Set(input.map((item) => typeof item === 'string' ? item.trim() : item).filter(Boolean))];
  const allowed = await db.all(
    "SELECT name FROM system_taxonomies WHERE account_id = ? AND kind = 'category'",
    accountId
  );
  const allowedNames = new Set(allowed.map((item) => item.name));
  if (!unique.every((c) => typeof c === 'string' && allowedNames.has(c))) {
    return { ok: false, error: 'Selecione apenas opções válidas de tipo de sistema.' };
  }
  return { ok: true, categories: unique };
}

async function parseNiche(input, accountId) {
  if (input === undefined) return { ok: true, niche: undefined };
  const niche = typeof input === 'string' ? input.trim() : '';
  if (!niche) return { ok: true, niche: '' };
  const found = await db.get(
    "SELECT id FROM system_taxonomies WHERE account_id = ? AND kind = 'niche' AND name = ?",
    accountId,
    niche
  );
  return found ? { ok: true, niche } : { ok: false, error: 'Selecione um nicho válido.' };
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
router.get('/options', ah(async (req, res) => {
  await ensureTaxonomies(req.user.account_id);
  const rows = await db.all(
    'SELECT kind, name FROM system_taxonomies WHERE account_id = ? ORDER BY kind, lower(name)',
    req.user.account_id
  );
  const owner = await db.get('SELECT public_slug FROM users WHERE id = ?', req.user.account_id);
  res.json({
    categories: rows.filter((item) => item.kind === 'category').map((item) => item.name),
    niches: rows.filter((item) => item.kind === 'niche').map((item) => item.name),
    public_url: `${req.protocol}://${req.get('host')}/sites-publicos/${owner.public_slug}`,
  });
}));

router.get('/categories', ah(async (req, res) => {
  await ensureTaxonomies(req.user.account_id);
  const rows = await db.all(
    "SELECT name FROM system_taxonomies WHERE account_id = ? AND kind = 'category' ORDER BY lower(name)",
    req.user.account_id
  );
  res.json({ categories: rows.map((item) => item.name) });
}));

router.post('/options/:kind', ah(async (req, res) => {
  const kind = req.params.kind === 'categories' ? 'category' : req.params.kind === 'niches' ? 'niche' : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
  if (!kind) return res.status(404).json({ error: 'Tipo de opção inválido.' });
  if (!name || name.length > 60) return res.status(400).json({ error: 'Informe um nome de até 60 caracteres.' });
  const duplicate = await db.get(
    'SELECT id FROM system_taxonomies WHERE account_id = ? AND kind = ? AND lower(name) = lower(?)',
    req.user.account_id,
    kind,
    name
  );
  if (duplicate) return res.status(409).json({ error: 'Essa opção já existe.' });
  const inserted = await db.run(
    'INSERT INTO system_taxonomies (account_id, kind, name) VALUES (?, ?, ?) RETURNING id, name',
    req.user.account_id,
    kind,
    name
  );
  res.status(201).json({ option: inserted.rows[0] });
}));

router.delete('/options/:kind/:name', ah(async (req, res) => {
  const kind = req.params.kind === 'categories' ? 'category' : req.params.kind === 'niches' ? 'niche' : '';
  const name = String(req.params.name || '').trim();
  if (!kind || !name) return res.status(404).json({ error: 'Opção não encontrada.' });

  const option = await db.get(
    'SELECT id, name FROM system_taxonomies WHERE account_id = ? AND kind = ? AND lower(name) = lower(?)',
    req.user.account_id,
    kind,
    name
  );
  if (!option) return res.status(404).json({ error: 'Opção não encontrada.' });

  if (kind === 'category') {
    const systems = await db.all('SELECT id, categories FROM systems WHERE user_id = ?', req.user.account_id);
    for (const system of systems) {
      let categories = [];
      try {
        const parsed = JSON.parse(system.categories || '[]');
        if (Array.isArray(parsed)) categories = parsed.filter((item) => item !== option.name);
      } catch (err) { /* valor antigo inválido: normaliza para uma lista vazia */ }
      await db.run('UPDATE systems SET categories = ?, updated_at = NOW() WHERE id = ?', JSON.stringify(categories), system.id);
    }
  } else {
    await db.run(
      'UPDATE systems SET niche = ?, updated_at = NOW() WHERE user_id = ? AND niche = ?',
      '',
      req.user.account_id,
      option.name
    );
  }

  await db.run('DELETE FROM system_taxonomies WHERE id = ?', option.id);
  res.json({ ok: true, name: option.name, kind });
}));

// Lista sistemas cadastrados (sem a senha em texto puro)
router.get(
  '/',
  ah(async (req, res) => {
    const rows = await db.all('SELECT * FROM systems WHERE user_id = ? ORDER BY id DESC', req.user.account_id);
    res.json({ systems: rows.map(toPublic) });
  })
);

// Cadastra um novo sistema
router.post(
  '/',
  ah(async (req, res) => {
    const {
      name, url, repo_url = '', login_email = '', login_password = '', logo = '',
      categories, subscriptions,
      contact_name = '', contact_whatsapp = '', contact_email = '',
      contract_file = '', contract_file_name = '',
      documentation_files, links, specifications = '', is_public = false, niche = '',
    } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Informe o nome do sistema.' });
    if (typeof login_email !== 'string' || typeof login_password !== 'string' || login_password.length > 500) {
      return res.status(400).json({ error: 'Credenciais do sistema inválidas.' });
    }
    const safeUrl = normalizeHttpUrl(url, { required: true });
    const safeRepoUrl = normalizeHttpUrl(repo_url);
    if (!safeUrl) return res.status(400).json({ error: 'Informe um link de acesso HTTP ou HTTPS válido.' });
    if (repo_url && !safeRepoUrl) return res.status(400).json({ error: 'Informe um link de repositório válido.' });
    if (!validLogo(logo)) return res.status(400).json({ error: 'Logo inválida ou muito grande (máx. ~1MB).' });
    if (!validContractFile(contract_file)) {
      return res.status(400).json({ error: 'Anexo de contrato inválido ou muito grande (máx. ~5MB, PDF ou imagem).' });
    }

    await ensureTaxonomies(req.user.account_id);
    const cat = await parseCategories(categories, req.user.account_id);
    if (!cat.ok) return res.status(400).json({ error: cat.error });
    const nicheResult = await parseNiche(niche, req.user.account_id);
    if (!nicheResult.ok) return res.status(400).json({ error: nicheResult.error });
    const subs = parseSubscriptions(subscriptions);
    if (!subs.ok) return res.status(400).json({ error: subs.error });
    const contact = parseContact(contact_name, contact_whatsapp, contact_email);
    if (!contact.ok) return res.status(400).json({ error: contact.error });
    const docs = parseDocumentationFiles(documentation_files);
    if (!docs.ok) return res.status(400).json({ error: docs.error });
    const linksResult = parseLinks(links);
    if (!linksResult.ok) return res.status(400).json({ error: linksResult.error });

    const inserted = await db.run(
      `INSERT INTO systems
        (user_id, name, url, repo_url, login_email, login_password_enc, logo, categories, subscriptions,
         contact_name, contact_whatsapp, contact_email, contract_file, contract_file_name, documentation_files, links,
         specifications, is_public, niche)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       RETURNING *`,
      req.user.account_id, name.trim().slice(0, 200), safeUrl, safeRepoUrl, login_email.trim().slice(0, 320), encrypt(login_password), logo,
      JSON.stringify(cat.categories || []), JSON.stringify(subs.subscriptions || []),
      contact.contact_name, contact.contact_whatsapp, contact.contact_email,
      contract_file || '', (contract_file_name || '').trim().slice(0, 200),
      JSON.stringify(docs.files || []), JSON.stringify(linksResult.links || []),
      String(specifications || '').trim().slice(0, 5000), is_public ? 1 : 0, nicheResult.niche || ''
    );

    res.status(201).json({ system: toPublic(inserted.rows[0]) });
  })
);

// Atualiza um sistema
router.put(
  '/:id',
  ah(async (req, res) => {
    const row = await getOwned(req.params.id, req.user.account_id);
    if (!row) return res.status(404).json({ error: 'Sistema não encontrado.' });

    const {
      name, url, repo_url, login_email, login_password, logo,
      categories, subscriptions,
      contact_name, contact_whatsapp, contact_email,
      contract_file, contract_file_name,
      documentation_files, links, specifications, is_public, niche,
    } = req.body || {};
    if ((login_email !== undefined && typeof login_email !== 'string') ||
        (login_password !== undefined && (typeof login_password !== 'string' || login_password.length > 500))) {
      return res.status(400).json({ error: 'Credenciais do sistema inválidas.' });
    }
    if (logo !== undefined && !validLogo(logo)) {
      return res.status(400).json({ error: 'Logo inválida ou muito grande (máx. ~1MB).' });
    }
    if (contract_file !== undefined && !validContractFile(contract_file)) {
      return res.status(400).json({ error: 'Anexo de contrato inválido ou muito grande (máx. ~5MB, PDF ou imagem).' });
    }
    await ensureTaxonomies(req.user.account_id);
    const cat = await parseCategories(categories, req.user.account_id);
    if (!cat.ok) return res.status(400).json({ error: cat.error });
    const nicheResult = await parseNiche(niche, req.user.account_id);
    if (!nicheResult.ok) return res.status(400).json({ error: nicheResult.error });
    const subs = parseSubscriptions(subscriptions);
    if (!subs.ok) return res.status(400).json({ error: subs.error });
    const contact = parseContact(
      contact_name === undefined ? row.contact_name : contact_name,
      contact_whatsapp === undefined ? row.contact_whatsapp : contact_whatsapp,
      contact_email === undefined ? row.contact_email : contact_email
    );
    if (!contact.ok) return res.status(400).json({ error: contact.error });
    const docs = parseDocumentationFiles(documentation_files);
    if (!docs.ok) return res.status(400).json({ error: docs.error });
    const linksResult = parseLinks(links);
    if (!linksResult.ok) return res.status(400).json({ error: linksResult.error });

    const newName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 200) : row.name;
    const newUrl = url === undefined ? row.url : normalizeHttpUrl(url, { required: true });
    const newRepoUrl = repo_url === undefined ? row.repo_url : normalizeHttpUrl(repo_url);
    if (!newUrl) return res.status(400).json({ error: 'Informe um link de acesso HTTP ou HTTPS válido.' });
    if (repo_url && !newRepoUrl) return res.status(400).json({ error: 'Informe um link de repositório válido.' });
    const newEmail = typeof login_email === 'string' ? login_email.trim() : row.login_email;
    const newPassEnc =
      typeof login_password === 'string' && login_password !== '' ? encrypt(login_password) : row.login_password_enc;
    const newLogo = typeof logo === 'string' ? logo : row.logo;
    const newCategories = cat.categories === undefined ? row.categories : JSON.stringify(cat.categories);
    const newSubscriptions = subs.subscriptions === undefined ? row.subscriptions : JSON.stringify(subs.subscriptions);
    const newContractFile = typeof contract_file === 'string' ? contract_file : row.contract_file;
    const newContractFileName =
      typeof contract_file_name === 'string' ? contract_file_name.trim().slice(0, 200) : row.contract_file_name;
    const newDocumentationFiles = docs.files === undefined ? row.documentation_files : JSON.stringify(docs.files);
    const newLinks = linksResult.links === undefined ? row.links : JSON.stringify(linksResult.links);
    const newSpecifications = typeof specifications === 'string' ? specifications.trim().slice(0, 5000) : row.specifications;
    const newIsPublic = typeof is_public === 'boolean' ? (is_public ? 1 : 0) : row.is_public;
    const newNiche = nicheResult.niche === undefined ? row.niche : nicheResult.niche;

    const updated = await db.run(
      `UPDATE systems SET name=?, url=?, repo_url=?, login_email=?, login_password_enc=?, logo=?,
         categories=?, subscriptions=?, contact_name=?, contact_whatsapp=?, contact_email=?,
         contract_file=?, contract_file_name=?, documentation_files=?, links=?, specifications=?, is_public=?, niche=?,
         updated_at=NOW() WHERE id=?
       RETURNING *`,
      newName, newUrl, newRepoUrl, newEmail, newPassEnc, newLogo, newCategories, newSubscriptions,
      contact.contact_name, contact.contact_whatsapp, contact.contact_email,
      newContractFile, newContractFileName, newDocumentationFiles, newLinks,
      newSpecifications, newIsPublic, newNiche, row.id
    );

    res.json({ system: toPublic(updated.rows[0]) });
  })
);

// Exclui um sistema
router.delete(
  '/:id',
  ah(async (req, res) => {
    const row = await getOwned(req.params.id, req.user.account_id);
    if (!row) return res.status(404).json({ error: 'Sistema não encontrado.' });
    await db.run('DELETE FROM systems WHERE id = ?', row.id);
    res.json({ ok: true });
  })
);

// Revela as credenciais em texto puro (usado só no momento do "Login As")
router.get(
  '/:id/reveal',
  ah(async (req, res) => {
    const row = await getOwned(req.params.id, req.user.account_id);
    if (!row) return res.status(404).json({ error: 'Sistema não encontrado.' });
    res.json({
      url: row.url,
      login_email: row.login_email,
      login_password: decrypt(row.login_password_enc),
    });
  })
);

module.exports = router;
