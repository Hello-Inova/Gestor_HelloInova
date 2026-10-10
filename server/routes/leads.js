// Rotas do módulo de Leads.
//
// Diferente dos outros arquivos de rotas deste projeto, este arquivo mistura
// rotas PÚBLICAS (o formulário de captação em public/captacao.html não tem
// nenhum contexto de autenticação) com rotas AUTENTICADAS (a listagem/gestão
// dentro do Gestor). Por isso "requireAuth" é aplicado rota a rota, e não no
// router inteiro como acontece em pages.js/systems.js/dashboard.js.
const express = require('express');
const crypto = require('node:crypto');
const db = require('../db');
const { requireAuth } = require('../auth');
const { rateLimit } = require('../rate-limit');
const { requireAnyModule } = require('../permissions');
const {
  MAX_FILE_BYTES,
  LeadImportError,
  createLeadImportTemplateBuffer,
  duplicateKey,
  parseLeadWorkbook,
  whatsappDigits,
} = require('../lead-import');

const router = express.Router();

// Express 4 não encaminha automaticamente rejeições de handlers async para o
// middleware de erro — sem isso, um erro depois de um "await" faria a
// requisição travar sem resposta.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATUSES = ['novo', 'em_contato', 'convertido', 'perdido'];
const VALID_SERVICES = ['Landing Page', 'Website', 'Cardápio Digital', 'E-mail Corporativo', 'Outro'];
const limitLeadCreation = rateLimit({ name: 'lead-create', max: 10, windowMinutes: 60 });
const limitLeadCompletion = rateLimit({ name: 'lead-complete', max: 20, windowMinutes: 60 });
const limitLeadImport = rateLimit({ name: 'lead-import', max: 10, windowMinutes: 60 });

function hashPublicToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Classifica a origem do lead a partir do referrer (document.referrer,
// capturado no navegador de quem preencheu o formulário). Não é possível
// descobrir o perfil pessoal do Instagram de quem preencheu — apenas que a
// visita veio de um clique dentro do instagram.com (ex: link na bio).
function classifySource(referrerUrl) {
  if (!referrerUrl || typeof referrerUrl !== 'string') return 'Direto/Outro';
  let host = '';
  try {
    host = new URL(referrerUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'Direto/Outro';
  }
  if (!host) return 'Direto/Outro';
  if (host.includes('instagram.com')) return 'Instagram';
  if (host.includes('facebook.com') || host.includes('fb.com')) return 'Facebook';
  if (host.includes('google.')) return 'Google';
  if (host.includes('whatsapp.com') || host.includes('wa.me')) return 'WhatsApp';
  if (host.includes('linkedin.com')) return 'LinkedIn';
  if (host.includes('tiktok.com')) return 'TikTok';
  return host;
}

function sanitizeServices(services) {
  if (!Array.isArray(services)) return [];
  return services.filter((s) => VALID_SERVICES.includes(s));
}

// "services" é salvo como TEXT (JSON serializado) no Postgres — o driver
// não faz esse parse sozinho, então cada lead devolvido ao front precisa
// passar por aqui para virar array de verdade (mesmo padrão usado em
// server/routes/systems.js para "categories"/"subscriptions"/etc).
function serializeLead(row) {
  let services = [];
  try {
    const parsed = JSON.parse(row.services || '[]');
    if (Array.isArray(parsed)) services = parsed;
  } catch { /* mantém [] em caso de dado inválido */ }
  return { ...row, services };
}

// ---------------- Rotas públicas (sem autenticação) ----------------

// Etapa 1 do formulário público: nome, WhatsApp e e-mail. Salva o lead
// imediatamente, mesmo que a pessoa abandone antes da etapa 2.
router.post(
  '/',
  limitLeadCreation,
  ah(async (req, res) => {
    const { name, whatsapp, email, referrer_url } = req.body || {};

    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Informe o nome completo.' });
    if (typeof whatsapp !== 'string' || !whatsapp.trim()) return res.status(400).json({ error: 'Informe o WhatsApp.' });
    if (typeof email !== 'string' || email.length > 320 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }

    const referrerUrl = typeof referrer_url === 'string' ? referrer_url.slice(0, 2000) : '';
    const source = classifySource(referrerUrl);

    const updateToken = crypto.randomBytes(32).toString('hex');
    const inserted = await db.run(
      `INSERT INTO leads (name, whatsapp, email, referrer_url, source, step_completed, public_token_hash)
       VALUES (?, ?, ?, ?, ?, 1, ?) RETURNING id`,
      name.trim().slice(0, 200),
      whatsapp.trim().slice(0, 40),
      email.trim().toLowerCase(),
      referrerUrl,
      source,
      hashPublicToken(updateToken)
    );

    res.status(201).json({ id: inserted.rows[0].id, update_token: updateToken });
  })
);

// Etapa 2 do formulário público (opcional): serviços desejados, ramo de
// negócio, descrição da necessidade. Rota pública restrita a estes campos —
// nunca permite alterar "status" ou outros campos administrativos.
router.patch(
  '/:id/step2',
  limitLeadCompletion,
  ah(async (req, res) => {
    const updateToken = req.body && req.body.update_token;
    if (typeof updateToken !== 'string' || !/^[a-f0-9]{64}$/.test(updateToken)) {
      return res.status(404).json({ error: 'Lead não encontrado.' });
    }
    const lead = await db.get(
      'SELECT id FROM leads WHERE id = ? AND public_token_hash = ?',
      req.params.id,
      hashPublicToken(updateToken)
    );
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    const { services, business_segment, business_segment_other, description } = req.body || {};

    const safeServices = JSON.stringify(sanitizeServices(services));
    const safeSegment = typeof business_segment === 'string' ? business_segment.slice(0, 200) : '';
    const safeSegmentOther =
      typeof business_segment_other === 'string' ? business_segment_other.slice(0, 200) : '';
    const safeDescription = typeof description === 'string' ? description.slice(0, 5000) : '';

    await db.run(
      `UPDATE leads SET
         services = ?,
         business_segment = ?,
         business_segment_other = ?,
         description = ?,
         step_completed = 2,
         updated_at = NOW()
       WHERE id = ?`,
      safeServices,
      safeSegment,
      safeSegmentOther,
      safeDescription,
      lead.id
    );

    res.json({ ok: true });
  })
);

// ---------------- Rotas autenticadas (módulo Leads no Gestor) ----------------

router.get(
  '/',
  requireAuth,
  requireAnyModule('leads'),
  ah(async (req, res) => {
    const rows = await db.all('SELECT * FROM leads ORDER BY created_at DESC');
    res.json({ leads: rows.map(serializeLead) });
  })
);

router.get(
  '/import-template',
  requireAuth,
  requireAnyModule('leads'),
  (req, res) => {
    const template = createLeadImportTemplateBuffer();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modelo-importacao-leads.xlsx"',
      'Content-Length': String(template.length),
      'Cache-Control': 'private, no-store',
    });
    res.send(template);
  }
);

router.post(
  '/import',
  requireAuth,
  requireAnyModule('leads'),
  limitLeadImport,
  ah(async (req, res) => {
    const { file_name: fileName, file_data: fileData } = req.body || {};
    if (typeof fileName !== 'string' || typeof fileData !== 'string') {
      return res.status(400).json({ error: 'Selecione um arquivo Excel para importar.' });
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(fileData) || fileData.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 8) {
      return res.status(400).json({ error: 'O arquivo enviado é inválido ou excede 2,5 MB.' });
    }

    let parsed;
    try {
      parsed = parseLeadWorkbook(Buffer.from(fileData, 'base64'), fileName);
    } catch (err) {
      if (err instanceof LeadImportError) {
        return res.status(400).json({ error: err.message, errors: err.details });
      }
      throw err;
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const emails = [...new Set(parsed.leads.map((lead) => lead.email))];
      const existingResult = emails.length
        ? await client.query('SELECT email, whatsapp FROM leads WHERE lower(email) = ANY($1::text[])', [emails])
        : { rows: [] };
      const existingKeys = new Set(existingResult.rows.map((lead) => duplicateKey(lead.email, lead.whatsapp)));
      const fileKeys = new Set();
      const uniqueLeads = [];
      const duplicateErrors = [];

      parsed.leads.forEach((lead) => {
        const key = duplicateKey(lead.email, lead.whatsapp);
        if (existingKeys.has(key) || fileKeys.has(key)) {
          duplicateErrors.push({
            row: lead.source_row,
            email: lead.email,
            message: 'Lead duplicado (mesmo e-mail e WhatsApp).',
          });
          return;
        }
        fileKeys.add(key);
        uniqueLeads.push(lead);
      });

      let importedRows = [];
      if (uniqueLeads.length) {
        const params = [];
        const valueGroups = uniqueLeads.map((lead, rowIndex) => {
          const offset = rowIndex * 13;
          params.push(
            lead.name,
            lead.whatsapp,
            lead.email,
            JSON.stringify(lead.services),
            lead.business_segment,
            lead.business_segment_other,
            lead.description,
            lead.instagram_url,
            lead.responsible_name,
            lead.responsible_contact,
            lead.source,
            lead.step_completed,
            lead.status
          );
          return `(${Array.from({ length: 13 }, (_, index) => `$${offset + index + 1}`).join(', ')})`;
        });
        const inserted = await client.query(
          `INSERT INTO leads
             (name, whatsapp, email, services, business_segment, business_segment_other,
              description, instagram_url, responsible_name, responsible_contact,
              source, step_completed, status)
           VALUES ${valueGroups.join(', ')}
           RETURNING *`,
          params
        );
        importedRows = inserted.rows;
      }

      await client.query('COMMIT');
      res.status(201).json({
        imported_count: importedRows.length,
        duplicate_count: duplicateErrors.length,
        rejected_count: parsed.errors.length,
        total_rows: parsed.totalRows,
        sheet_name: parsed.sheetName,
        errors: [...parsed.errors, ...duplicateErrors].slice(0, 50),
        leads: importedRows.map(serializeLead),
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

router.put(
  '/:id',
  requireAuth,
  requireAnyModule('leads'),
  ah(async (req, res) => {
    const lead = await db.get('SELECT * FROM leads WHERE id = ?', req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    const body = req.body || {};
    const current = serializeLead(lead);
    const status = body.status === undefined ? current.status : body.status;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : current.name;
    const whatsapp = typeof body.whatsapp === 'string' ? body.whatsapp.trim().slice(0, 40) : current.whatsapp;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 320) : current.email;
    if (!name) return res.status(400).json({ error: 'Informe o nome completo.' });
    if (!whatsapp || whatsappDigits(whatsapp).length < 8) {
      return res.status(400).json({ error: 'WhatsApp inválido.' });
    }
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });

    const services = Array.isArray(body.services)
      ? [...new Set(body.services.map((service) => String(service).trim().slice(0, 120)).filter(Boolean))].slice(0, 20)
      : current.services;
    const businessSegment = typeof body.business_segment === 'string'
      ? body.business_segment.trim().slice(0, 200)
      : current.business_segment;
    const description = typeof body.description === 'string'
      ? body.description.trim().slice(0, 5000)
      : current.description;
    const instagramUrl = typeof body.instagram_url === 'string'
      ? body.instagram_url.trim().slice(0, 2000)
      : current.instagram_url;
    const responsibleName = typeof body.responsible_name === 'string'
      ? body.responsible_name.trim().slice(0, 200)
      : current.responsible_name;
    const responsibleContact = typeof body.responsible_contact === 'string'
      ? body.responsible_contact.trim().slice(0, 200)
      : current.responsible_contact;

    const updated = await db.run(
      `UPDATE leads SET
         name = ?, whatsapp = ?, email = ?, services = ?, business_segment = ?,
         description = ?, instagram_url = ?, responsible_name = ?, responsible_contact = ?,
         status = ?, updated_at = NOW()
       WHERE id = ? RETURNING *`,
      name,
      whatsapp,
      email,
      JSON.stringify(services),
      businessSegment,
      description,
      instagramUrl,
      responsibleName,
      responsibleContact,
      status,
      lead.id
    );
    res.json({ lead: serializeLead(updated.rows[0]) });
  })
);

router.delete(
  '/:id',
  requireAuth,
  requireAnyModule('leads'),
  ah(async (req, res) => {
    const lead = await db.get('SELECT id FROM leads WHERE id = ?', req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    await db.run('DELETE FROM leads WHERE id = ?', lead.id);
    res.json({ ok: true });
  })
);

module.exports = router;
