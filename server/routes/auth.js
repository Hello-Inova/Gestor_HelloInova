const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const {
  hashPassword,
  verifyPassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} = require('../auth');
const { sendVerificationEmail } = require('../email');

const router = express.Router();

// Express 4 não encaminha automaticamente rejeições de handlers async para o
// middleware de erro — sem isso, um erro depois de um "await" (ex: falha no
// banco ou no envio de e-mail) faria a requisição travar sem resposta.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PURPOSES = ['register', 'login'];

const CODE_LENGTH = 6;
const CODE_EXPIRY_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 45;

const LOGIN_RATE_LIMIT_MAX = 3;
const LOGIN_RATE_LIMIT_WINDOW_MINUTES = 15;

// ---------------- Helpers ----------------

function getClientIp(req) {
  const raw = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  return raw.replace('::ffff:', '');
}

// Trava de força bruta: no máximo LOGIN_RATE_LIMIT_MAX tentativas de login
// por IP a cada LOGIN_RATE_LIMIT_WINDOW_MINUTES minutos. Cada chamada a
// POST /login (sucesso ou falha) conta como uma tentativa.
// LOGIN_RATE_LIMIT_WINDOW_MINUTES é uma constante fixa do código (não vem
// do usuário), por isso é seguro interpolá-la direto no INTERVAL abaixo.
async function isLoginRateLimited(ip) {
  const row = await db.get(
    `SELECT COUNT(*) as c FROM login_attempts
     WHERE ip = ? AND created_at >= NOW() - INTERVAL '${LOGIN_RATE_LIMIT_WINDOW_MINUTES} minutes'`,
    ip
  );
  return Number(row.c) >= LOGIN_RATE_LIMIT_MAX;
}

async function recordLoginAttempt(ip) {
  await db.run('INSERT INTO login_attempts (ip) VALUES (?)', ip);
}

function generateCode() {
  return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

// Cria e persiste um novo código de verificação (invalidando os anteriores
// do mesmo e-mail/finalidade), retornando o código em texto puro (só para
// ser enviado por e-mail — nunca é salvo em texto puro no banco).
async function createVerificationCode(email, purpose, userId) {
  const code = generateCode();
  const codeHash = bcrypt.hashSync(code, 8);
  await db.run(
    `UPDATE verification_codes SET consumed = 1
     WHERE email = ? AND purpose = ? AND consumed = 0`,
    email.toLowerCase(),
    purpose
  );
  await db.run(
    `INSERT INTO verification_codes (email, code_hash, purpose, user_id, expires_at)
     VALUES (?, ?, ?, ?, NOW() + INTERVAL '${CODE_EXPIRY_MINUTES} minutes')`,
    email.toLowerCase(),
    codeHash,
    purpose,
    userId || null
  );
  return code;
}

async function getActiveCode(email, purpose) {
  return db.get(
    `SELECT * FROM verification_codes
     WHERE email = ? AND purpose = ? AND consumed = 0 AND expires_at >= NOW()
     ORDER BY id DESC LIMIT 1`,
    email.toLowerCase(),
    purpose
  );
}

async function getLastCodeRow(email, purpose) {
  return db.get(
    `SELECT * FROM verification_codes WHERE email = ? AND purpose = ?
     ORDER BY id DESC LIMIT 1`,
    email.toLowerCase(),
    purpose
  );
}

// Verifica um código informado pelo usuário. Retorna { ok, error }.
async function consumeCode(email, purpose, code) {
  const row = await getActiveCode(email, purpose);
  if (!row) return { ok: false, error: 'Código inválido ou expirado. Solicite um novo código.' };
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    await db.run('UPDATE verification_codes SET consumed = 1 WHERE id = ?', row.id);
    return { ok: false, error: 'Muitas tentativas incorretas. Solicite um novo código.' };
  }
  if (!bcrypt.compareSync(String(code || ''), row.code_hash)) {
    await db.run('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?', row.id);
    return { ok: false, error: 'Código incorreto.' };
  }
  await db.run('UPDATE verification_codes SET consumed = 1 WHERE id = ?', row.id);
  return { ok: true };
}

function loginUser(res, row) {
  const user = { id: row.id, name: row.name, email: row.email, account_id: row.account_id };
  const token = signToken(user);
  setAuthCookie(res, token);
  return { id: user.id, name: user.name, email: user.email };
}

// ---------------- Cadastro de usuário (bootstrap de uma conta nova) ----------------
// Não é mais acessível pela tela de login (removida a pedido do cliente) —
// fica disponível apenas como rota de backend para eventualmente criar uma
// conta totalmente nova e independente (ex: outra empresa usando o mesmo
// sistema). Para adicionar uma pessoa à conta já existente, use
// POST /api/auth/users (exige estar logado) — ver mais abaixo.
router.post(
  '/register',
  ah(async (req, res) => {
    const { name, email, password } = req.body || {};

    if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome.' });
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres.' });

    const normalizedEmail = email.toLowerCase();
    const existing = await db.get('SELECT id FROM users WHERE email = ?', normalizedEmail);
    if (existing) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });

    const inserted = await db.run(
      'INSERT INTO users (name, email, password_hash, role, email_verified) VALUES (?, ?, ?, ?, 0) RETURNING id',
      name.trim(),
      normalizedEmail,
      hashPassword(password),
      'admin'
    );
    const userId = inserted.rows[0].id;
    // Conta nova e independente: é dona de si mesma.
    await db.run('UPDATE users SET account_id = ? WHERE id = ?', userId, userId);

    // Cria os módulos iniciais fixos da conta: Gestor de Sistemas, Dashboard
    // e Cadastro de Usuário.
    await db.run(
      'INSERT INTO pages (user_id, name, type, order_index) VALUES (?, ?, ?, ?)',
      userId,
      'Gestor de Sistemas',
      'systems',
      0
    );
    await db.run(
      'INSERT INTO pages (user_id, name, type, order_index) VALUES (?, ?, ?, ?)',
      userId,
      'Dashboard',
      'dashboard',
      1
    );
    await db.run(
      'INSERT INTO pages (user_id, name, type, order_index) VALUES (?, ?, ?, ?)',
      userId,
      'Cadastro de Usuário',
      'users',
      2
    );
    await db.run('UPDATE users SET systems_seeded = 1, dashboard_seeded = 1 WHERE id = ?', userId);

    const code = await createVerificationCode(normalizedEmail, 'register', userId);
    await sendVerificationEmail({ to: normalizedEmail, name: name.trim(), code, purpose: 'register' });

    res.status(201).json({ pending: true, purpose: 'register', email: normalizedEmail });
  })
);

// ---------------- Confirmação de e-mail (finaliza o cadastro) ----------------
router.post(
  '/verify-email',
  ah(async (req, res) => {
    const { email, code } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (!code) return res.status(400).json({ error: 'Informe o código recebido por e-mail.' });

    const normalizedEmail = email.toLowerCase();
    const result = await consumeCode(normalizedEmail, 'register', code);
    if (!result.ok) return res.status(400).json({ error: result.error });

    const row = await db.get('SELECT * FROM users WHERE email = ?', normalizedEmail);
    if (!row) return res.status(404).json({ error: 'Conta não encontrada.' });

    await db.run('UPDATE users SET email_verified = 1 WHERE id = ?', row.id);
    const user = loginUser(res, row);
    res.json({ user });
  })
);

// ---------------- Login (etapa 1: credenciais) ----------------
router.post(
  '/login',
  ah(async (req, res) => {
    const { email, password } = req.body || {};
    const ip = getClientIp(req);

    if (await isLoginRateLimited(ip)) {
      return res.status(429).json({
        error: `Muitas tentativas de login a partir deste endereço. Aguarde ${LOGIN_RATE_LIMIT_WINDOW_MINUTES} minutos e tente novamente.`,
      });
    }
    await recordLoginAttempt(ip);

    if (!email || !password) return res.status(400).json({ error: 'Informe e-mail e senha.' });

    const normalizedEmail = email.toLowerCase();
    const row = await db.get('SELECT * FROM users WHERE email = ?', normalizedEmail);
    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    if (!row.email_verified) {
      const code = await createVerificationCode(normalizedEmail, 'register', row.id);
      await sendVerificationEmail({ to: normalizedEmail, name: row.name, code, purpose: 'register' });
      return res.status(403).json({
        error: 'Confirme seu e-mail para continuar. Enviamos um novo código de confirmação.',
        needs_verification: true,
        purpose: 'register',
        email: normalizedEmail,
      });
    }

    const code = await createVerificationCode(normalizedEmail, 'login', row.id);
    await sendVerificationEmail({ to: normalizedEmail, name: row.name, code, purpose: 'login' });
    res.json({ requires_code: true, purpose: 'login', email: normalizedEmail });
  })
);

// ---------------- Login (etapa 2: código de verificação) ----------------
router.post(
  '/verify-login',
  ah(async (req, res) => {
    const { email, code } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (!code) return res.status(400).json({ error: 'Informe o código recebido por e-mail.' });

    const normalizedEmail = email.toLowerCase();
    const result = await consumeCode(normalizedEmail, 'login', code);
    if (!result.ok) return res.status(400).json({ error: result.error });

    const row = await db.get('SELECT * FROM users WHERE email = ?', normalizedEmail);
    if (!row) return res.status(404).json({ error: 'Conta não encontrada.' });

    const user = loginUser(res, row);
    res.json({ user });
  })
);

// ---------------- Reenvio de código ----------------
router.post(
  '/resend-code',
  ah(async (req, res) => {
    const { email, purpose } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (!PURPOSES.includes(purpose)) return res.status(400).json({ error: 'Finalidade inválida.' });

    const normalizedEmail = email.toLowerCase();
    const row = await db.get('SELECT * FROM users WHERE email = ?', normalizedEmail);
    if (!row) return res.status(404).json({ error: 'Conta não encontrada.' });
    if (purpose === 'register' && row.email_verified) {
      return res.status(400).json({ error: 'Este e-mail já foi confirmado.' });
    }

    const last = await getLastCodeRow(normalizedEmail, purpose);
    if (last) {
      const cooldown = await db.get(
        `SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) as secs FROM verification_codes WHERE id = ?`,
        last.id
      );
      if (cooldown && Number(cooldown.secs) < RESEND_COOLDOWN_SECONDS) {
        const wait = Math.ceil(RESEND_COOLDOWN_SECONDS - Number(cooldown.secs));
        return res.status(429).json({ error: `Aguarde ${wait}s antes de solicitar um novo código.` });
      }
    }

    const code = await createVerificationCode(normalizedEmail, purpose, row.id);
    await sendVerificationEmail({ to: normalizedEmail, name: row.name, code, purpose });
    res.json({ ok: true });
  })
);

// ---------------- Logout ----------------
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// ---------------- Usuário atual ----------------
router.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const row = await db.get('SELECT id, name, email, role, created_at FROM users WHERE id = ?', req.user.id);
    if (!row) return res.status(401).json({ error: 'Não autenticado.' });
    res.json({ user: row });
  })
);

// ---------------- Atualiza o perfil do usuário logado ----------------
router.put(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const current = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
    if (!current) return res.status(401).json({ error: 'Não autenticado.' });

    const { name, email, password } = req.body || {};

    const newName = typeof name === 'string' && name.trim() ? name.trim() : current.name;
    const newEmailRaw = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : current.email;

    if (!EMAIL_RE.test(newEmailRaw)) return res.status(400).json({ error: 'E-mail inválido.' });

    if (newEmailRaw !== current.email) {
      const clash = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', newEmailRaw, current.id);
      if (clash) return res.status(409).json({ error: 'Este e-mail já está em uso por outra conta.' });
    }

    let newHash = current.password_hash;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'A nova senha deve ter ao menos 6 caracteres.' });
      newHash = hashPassword(password);
    }

    await db.run(
      'UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?',
      newName,
      newEmailRaw,
      newHash,
      current.id
    );

    const user = { id: current.id, name: newName, email: newEmailRaw, account_id: current.account_id };
    const token = signToken(user);
    setAuthCookie(res, token);

    const updated = await db.get('SELECT id, name, email, role, created_at FROM users WHERE id = ?', current.id);
    res.json({ user: updated });
  })
);

// ---------------- Cadastro de usuário dentro da conta (só p/ logados) ----------------
// Só é possível criar um novo usuário a partir de uma sessão já autenticada
// (não existe mais cadastro público na tela de login). O novo usuário
// entra na MESMA conta de quem o criou — passa a compartilhar os mesmos
// sistemas, assinaturas e dashboard. Como quem cadastra já é uma pessoa de
// confiança da equipe, o e-mail já entra confirmado (sem precisar do passo
// de verificação); o login normal com código em duas etapas continua valendo.
router.get(
  '/users',
  requireAuth,
  ah(async (req, res) => {
    const rows = await db.all(
      'SELECT id, name, email, created_at FROM users WHERE account_id = ? ORDER BY id ASC',
      req.user.account_id
    );
    res.json({ users: rows });
  })
);

router.post(
  '/users',
  requireAuth,
  ah(async (req, res) => {
    const { name, email, password } = req.body || {};

    if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome.' });
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres.' });

    const normalizedEmail = email.toLowerCase();
    const existing = await db.get('SELECT id FROM users WHERE email = ?', normalizedEmail);
    if (existing) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });

    const inserted = await db.run(
      `INSERT INTO users (name, email, password_hash, role, email_verified, account_id)
       VALUES (?, ?, ?, ?, 1, ?)
       RETURNING id, name, email, created_at`,
      name.trim(),
      normalizedEmail,
      hashPassword(password),
      'admin',
      req.user.account_id
    );

    res.status(201).json({ user: inserted.rows[0] });
  })
);

module.exports = router;
