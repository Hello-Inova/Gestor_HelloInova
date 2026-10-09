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
  ah(async (req, res) => {
    const rows = await db.all('SELECT * FROM leads ORDER BY created_at DESC');
    res.json({ leads: rows.map(serializeLead) });
  })
);

router.put(
  '/:id',
  requireAuth,
  ah(async (req, res) => {
    const lead = await db.get('SELECT * FROM leads WHERE id = ?', req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    const { status } = req.body || {};
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const updated = await db.run(
      'UPDATE leads SET status = ?, updated_at = NOW() WHERE id = ? RETURNING *',
      status,
      lead.id
    );
    res.json({ lead: serializeLead(updated.rows[0]) });
  })
);

router.delete(
  '/:id',
  requireAuth,
  ah(async (req, res) => {
    const lead = await db.get('SELECT id FROM leads WHERE id = ?', req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    await db.run('DELETE FROM leads WHERE id = ?', lead.id);
    res.json({ ok: true });
  })
);

module.exports = router;
