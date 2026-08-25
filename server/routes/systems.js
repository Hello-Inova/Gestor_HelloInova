const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { encrypt, decrypt } = require('../crypto');

const router = express.Router();
router.use(requireAuth);

function toPublic(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    login_email: row.login_email,
    has_password: !!row.login_password_enc,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getOwned(id, userId) {
  return db.prepare('SELECT * FROM systems WHERE id = ? AND user_id = ?').get(id, userId);
}

// Lista sistemas cadastrados (sem a senha em texto puro)
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM systems WHERE user_id = ? ORDER BY id DESC')
    .all(req.user.id);
  res.json({ systems: rows.map(toPublic) });
});

// Cadastra um novo sistema
router.post('/', (req, res) => {
  const { name, url, login_email = '', login_password = '' } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome do sistema.' });
  if (!url || !url.trim()) return res.status(400).json({ error: 'Informe o link de acesso.' });

  const info = db
    .prepare(
      'INSERT INTO systems (user_id, name, url, login_email, login_password_enc) VALUES (?,?,?,?,?)'
    )
    .run(req.user.id, name.trim(), url.trim(), login_email.trim(), encrypt(login_password));

  const row = db.prepare('SELECT * FROM systems WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ system: toPublic(row) });
});

// Atualiza um sistema
router.put('/:id', (req, res) => {
  const row = getOwned(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Sistema não encontrado.' });

  const { name, url, login_email, login_password } = req.body || {};
  const newName = typeof name === 'string' && name.trim() ? name.trim() : row.name;
  const newUrl = typeof url === 'string' && url.trim() ? url.trim() : row.url;
  const newEmail = typeof login_email === 'string' ? login_email.trim() : row.login_email;
  const newPassEnc =
    typeof login_password === 'string' && login_password !== '' ? encrypt(login_password) : row.login_password_enc;

  db.prepare(
    `UPDATE systems SET name=?, url=?, login_email=?, login_password_enc=?, updated_at=datetime('now') WHERE id=?`
  ).run(newName, newUrl, newEmail, newPassEnc, row.id);

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
