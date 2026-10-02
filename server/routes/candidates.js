// Rotas do módulo de Candidatos.
// O POST é público para receber o formulário de SDR hospedado fora do Gestor;
// listagem, atualização de status e exclusão exigem sessão autenticada.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_EXPERIENCE = ['Estou começando', 'Até 1 ano', 'De 1 a 3 anos', 'Mais de 3 anos'];
const VALID_STATUSES = ['novo', 'em_analise', 'entrevista', 'aprovado', 'recusado'];
const DEFAULT_ALLOWED_ORIGINS = [
  'https://hello-inova.github.io',
  'https://hello-inova-sdr-freelancer.foggy-char-1093.chatgpt.site',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function allowedOrigins() {
  const extras = String(process.env.CANDIDATES_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extras]);
}

function trimText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validInstagramUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return ['http:', 'https:'].includes(url.protocol) &&
      (host === 'instagram.com' || host.endsWith('.instagram.com'));
  } catch {
    return false;
  }
}

function serializeCandidate(row) {
  return {
    ...row,
    desired_commission: Number(row.desired_commission),
  };
}

// CORS restrito às duas publicações oficiais do formulário. Requisições do
// próprio Gestor não trazem Origin diferente e continuam funcionando.
router.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && allowedOrigins().has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    if (origin && !allowedOrigins().has(origin)) {
      return res.status(403).json({ error: 'Origem não autorizada.' });
    }
    return res.status(204).end();
  }
  next();
});

// ---------------- Rota pública ----------------
router.post(
  '/',
  ah(async (req, res) => {
    const origin = req.get('origin');
    if (origin && !allowedOrigins().has(origin)) {
      return res.status(403).json({ error: 'Origem não autorizada.' });
    }

    const body = req.body || {};
    const name = trimText(body.name, 200);
    const whatsapp = trimText(body.whatsapp, 40);
    const email = trimText(body.email, 320).toLowerCase();
    const location = trimText(body.location, 200);
    const instagramUrl = trimText(body.instagram_url, 500);
    const experience = trimText(body.prospecting_experience, 100);
    const motivation = trimText(body.motivation, 700);
    const commission = Number(body.desired_commission);

    if (!name) return res.status(400).json({ error: 'Informe o nome completo.' });
    if (!whatsapp) return res.status(400).json({ error: 'Informe o WhatsApp.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (!location) return res.status(400).json({ error: 'Informe a cidade e o estado.' });
    if (!validInstagramUrl(instagramUrl)) {
      return res.status(400).json({ error: 'Informe um link válido do Instagram.' });
    }
    if (!VALID_EXPERIENCE.includes(experience)) {
      return res.status(400).json({ error: 'Experiência com prospecção inválida.' });
    }
    if (!Number.isFinite(commission) || commission < 1 || commission > 100) {
      return res.status(400).json({ error: 'A comissão deve estar entre 1% e 100%.' });
    }
    if (!motivation) return res.status(400).json({ error: 'Informe sua motivação.' });
    if (body.consent !== true) {
      return res.status(400).json({ error: 'É necessário aceitar o consentimento.' });
    }

    const inserted = await db.run(
      `INSERT INTO candidates
        (name, whatsapp, email, location, instagram_url, prospecting_experience,
         desired_commission, motivation, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, created_at`,
      name,
      whatsapp,
      email,
      location,
      instagramUrl,
      experience,
      commission,
      motivation,
      'formulario_sdr'
    );

    res.status(201).json({ ok: true, candidate: inserted.rows[0] });
  })
);

// ---------------- Rotas autenticadas ----------------
router.get(
  '/',
  requireAuth,
  ah(async (req, res) => {
    const rows = await db.all('SELECT * FROM candidates ORDER BY created_at DESC');
    res.json({ candidates: rows.map(serializeCandidate) });
  })
);

router.put(
  '/:id',
  requireAuth,
  ah(async (req, res) => {
    const candidate = await db.get('SELECT id FROM candidates WHERE id = ?', req.params.id);
    if (!candidate) return res.status(404).json({ error: 'Candidato não encontrado.' });

    const { status } = req.body || {};
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const updated = await db.run(
      'UPDATE candidates SET status = ?, updated_at = NOW() WHERE id = ? RETURNING *',
      status,
      candidate.id
    );
    res.json({ candidate: serializeCandidate(updated.rows[0]) });
  })
);

router.delete(
  '/:id',
  requireAuth,
  ah(async (req, res) => {
    const candidate = await db.get('SELECT id FROM candidates WHERE id = ?', req.params.id);
    if (!candidate) return res.status(404).json({ error: 'Candidato não encontrado.' });
    await db.run('DELETE FROM candidates WHERE id = ?', candidate.id);
    res.json({ ok: true });
  })
);

module.exports = router;
