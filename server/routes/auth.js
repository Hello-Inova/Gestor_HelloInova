const express = require('express');
const db = require('../db');
const {
  hashPassword,
  verifyPassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} = require('../auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cadastro de usuário
router.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome.' });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });

  const isFirstUser = db.prepare('SELECT COUNT(*) as c FROM users').get().c === 0;
  const role = isFirstUser ? 'admin' : 'admin'; // MVP: todos os usuários cadastrados são administradores do sistema

  const info = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name.trim(), email.toLowerCase(), hashPassword(password), role);

  const user = { id: Number(info.lastInsertRowid), name: name.trim(), email: email.toLowerCase() };

  // Cria o módulo inicial "Gestor de Sistemas" para o novo usuário
  db.prepare('INSERT INTO pages (user_id, name, type, order_index) VALUES (?, ?, ?, ?)').run(
    user.id,
    'Gestor de Sistemas',
    'systems',
    0
  );
  db.prepare('UPDATE users SET systems_seeded = 1 WHERE id = ?').run(user.id);

  const token = signToken(user);
  setAuthCookie(res, token);
  res.status(201).json({ user });
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Informe e-mail e senha.' });

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }

  const user = { id: row.id, name: row.name, email: row.email };
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ user });
});

// Logout
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// Usuário atual
router.get('/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(401).json({ error: 'Não autenticado.' });
  res.json({ user: row });
});

// Atualiza o perfil do usuário logado (nome, e-mail e, opcionalmente, senha)
router.put('/me', requireAuth, (req, res) => {
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!current) return res.status(401).json({ error: 'Não autenticado.' });

  const { name, email, password } = req.body || {};

  const newName = typeof name === 'string' && name.trim() ? name.trim() : current.name;
  const newEmailRaw = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : current.email;

  if (!EMAIL_RE.test(newEmailRaw)) return res.status(400).json({ error: 'E-mail inválido.' });

  if (newEmailRaw !== current.email) {
    const clash = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(newEmailRaw, current.id);
    if (clash) return res.status(409).json({ error: 'Este e-mail já está em uso por outra conta.' });
  }

  let newHash = current.password_hash;
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'A nova senha deve ter ao menos 6 caracteres.' });
    newHash = hashPassword(password);
  }

  db.prepare('UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?').run(
    newName,
    newEmailRaw,
    newHash,
    current.id
  );

  const user = { id: current.id, name: newName, email: newEmailRaw };
  const token = signToken(user);
  setAuthCookie(res, token);

  const updated = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(current.id);
  res.json({ user: updated });
});

module.exports = router;
