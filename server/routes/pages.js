const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

function getOwnedPage(pageId, userId) {
  return db.prepare('SELECT * FROM pages WHERE id = ? AND user_id = ?').get(pageId, userId);
}

// Lista páginas do usuário, com seus elementos
router.get('/', (req, res) => {
  const pages = db
    .prepare('SELECT * FROM pages WHERE user_id = ? ORDER BY order_index ASC, id ASC')
    .all(req.user.id);

  const elementsStmt = db.prepare('SELECT * FROM elements WHERE page_id = ? ORDER BY z_index ASC, id ASC');
  const result = pages.map((p) => ({ ...p, elements: elementsStmt.all(p.id) }));
  res.json({ pages: result });
});

// Cria página
router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome da página.' });

  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM pages WHERE user_id = ?')
    .get(req.user.id).m;

  const info = db
    .prepare('INSERT INTO pages (user_id, name, order_index) VALUES (?, ?, ?)')
    .run(req.user.id, name.trim(), maxOrder + 1);

  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ page: { ...page, elements: [] } });
});

// Renomeia / reordena página
router.put('/:id', (req, res) => {
  const page = getOwnedPage(req.params.id, req.user.id);
  if (!page) return res.status(404).json({ error: 'Página não encontrada.' });

  const { name, order_index } = req.body || {};
  const newName = typeof name === 'string' && name.trim() ? name.trim() : page.name;
  const newOrder = typeof order_index === 'number' ? order_index : page.order_index;

  db.prepare('UPDATE pages SET name = ?, order_index = ? WHERE id = ?').run(newName, newOrder, page.id);
  const updated = db.prepare('SELECT * FROM pages WHERE id = ?').get(page.id);
  res.json({ page: updated });
});

// Exclui página
router.delete('/:id', (req, res) => {
  const page = getOwnedPage(req.params.id, req.user.id);
  if (!page) return res.status(404).json({ error: 'Página não encontrada.' });

  const total = db.prepare('SELECT COUNT(*) as c FROM pages WHERE user_id = ?').get(req.user.id).c;
  if (total <= 1) return res.status(400).json({ error: 'É necessário manter ao menos uma página.' });

  db.prepare('DELETE FROM elements WHERE page_id = ?').run(page.id);
  db.prepare('DELETE FROM pages WHERE id = ?').run(page.id);
  res.json({ ok: true });
});

// Reordena várias páginas de uma vez (drag no menu lateral)
router.put('/', (req, res) => {
  const { order } = req.body || {}; // array de ids na nova ordem
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Ordem inválida.' });

  const update = db.prepare('UPDATE pages SET order_index = ? WHERE id = ? AND user_id = ?');
  order.forEach((id, idx) => update.run(idx, id, req.user.id));
  res.json({ ok: true });
});

// ---- Elementos ----

// Cria elemento em uma página
router.post('/:id/elements', (req, res) => {
  const page = getOwnedPage(req.params.id, req.user.id);
  if (!page) return res.status(404).json({ error: 'Página não encontrada.' });

  const {
    type,
    content = '',
    x = 5,
    y = 5,
    width = 20,
    height = 8,
    font_size = 14,
    font_color = '#EAF0FF',
    bg_color = '#1657FF',
    border_radius = 8,
    font_weight = '500',
    placeholder = '',
  } = req.body || {};

  const allowedTypes = ['label', 'input', 'button'];
  if (!allowedTypes.includes(type)) return res.status(400).json({ error: 'Tipo de elemento inválido.' });

  const maxZ = db
    .prepare('SELECT COALESCE(MAX(z_index), 0) as m FROM elements WHERE page_id = ?')
    .get(page.id).m;

  const info = db
    .prepare(
      `INSERT INTO elements
        (page_id, type, content, x, y, width, height, font_size, font_color, bg_color, border_radius, font_weight, z_index, placeholder)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      page.id,
      type,
      content,
      x,
      y,
      width,
      height,
      font_size,
      font_color,
      bg_color,
      border_radius,
      font_weight,
      maxZ + 1,
      placeholder
    );

  const element = db.prepare('SELECT * FROM elements WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ element });
});

function getOwnedElement(elementId, userId) {
  return db
    .prepare(
      `SELECT e.* FROM elements e
       JOIN pages p ON p.id = e.page_id
       WHERE e.id = ? AND p.user_id = ?`
    )
    .get(elementId, userId);
}

// Atualiza elemento (posição, tamanho, estilo, conteúdo)
router.put('/elements/:elId', (req, res) => {
  const el = getOwnedElement(req.params.elId, req.user.id);
  if (!el) return res.status(404).json({ error: 'Elemento não encontrado.' });

  const fields = [
    'content',
    'x',
    'y',
    'width',
    'height',
    'font_size',
    'font_color',
    'bg_color',
    'border_radius',
    'font_weight',
    'z_index',
    'placeholder',
  ];
  const updates = {};
  for (const f of fields) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, f)) {
      updates[f] = req.body[f];
    }
  }

  const merged = { ...el, ...updates };
  db.prepare(
    `UPDATE elements SET content=?, x=?, y=?, width=?, height=?, font_size=?, font_color=?, bg_color=?, border_radius=?, font_weight=?, z_index=?, placeholder=? WHERE id=?`
  ).run(
    merged.content,
    merged.x,
    merged.y,
    merged.width,
    merged.height,
    merged.font_size,
    merged.font_color,
    merged.bg_color,
    merged.border_radius,
    merged.font_weight,
    merged.z_index,
    merged.placeholder,
    el.id
  );

  const updated = db.prepare('SELECT * FROM elements WHERE id = ?').get(el.id);
  res.json({ element: updated });
});

// Exclui elemento
router.delete('/elements/:elId', (req, res) => {
  const el = getOwnedElement(req.params.elId, req.user.id);
  if (!el) return res.status(404).json({ error: 'Elemento não encontrado.' });
  db.prepare('DELETE FROM elements WHERE id = ?').run(el.id);
  res.json({ ok: true });
});

module.exports = router;
