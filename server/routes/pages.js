const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// Express 4 não encaminha automaticamente rejeições de handlers async para o
// middleware de erro — sem isso, um erro depois de um "await" faria a
// requisição travar sem resposta.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function getOwnedPage(pageId, accountId) {
  return db.get('SELECT * FROM pages WHERE id = ? AND user_id = ?', pageId, accountId);
}

// Garante que toda CONTA ganhe o módulo especial "Gestor de Sistemas" uma
// única vez (na primeira listagem após o cadastro/migração). Usa a flag
// systems_seeded para não recriar o módulo caso a conta o exclua de
// propósito. Na prática isso já acontece de forma atômica em POST
// /auth/register — esta função fica como rede de segurança.
async function ensureSystemsModule(accountId) {
  const user = await db.get('SELECT systems_seeded FROM users WHERE id = ?', accountId);
  if (!user || user.systems_seeded) return;

  // Se já existe um módulo comum com esse mesmo nome (de antes desta atualização),
  // renomeia para não confundir com o novo módulo especial.
  const clash = await db.get(
    "SELECT id, name FROM pages WHERE user_id = ? AND type != 'systems' AND lower(name) = 'gestor de sistemas'",
    accountId
  );
  if (clash) {
    await db.run('UPDATE pages SET name = ? WHERE id = ?', clash.name + ' (antigo)', clash.id);
  }

  await db.run('UPDATE pages SET order_index = order_index + 1 WHERE user_id = ?', accountId);
  await db.run(
    "INSERT INTO pages (user_id, name, type, order_index) VALUES (?, 'Gestor de Sistemas', 'systems', 0)",
    accountId
  );
  await db.run('UPDATE users SET systems_seeded = 1 WHERE id = ?', accountId);
}

// Lista módulos da conta, com seus elementos
router.get(
  '/',
  ah(async (req, res) => {
    await ensureSystemsModule(req.user.account_id);

    const pages = await db.all(
      'SELECT * FROM pages WHERE user_id = ? ORDER BY order_index ASC, id ASC',
      req.user.account_id
    );

    const result = await Promise.all(
      pages.map(async (p) => ({
        ...p,
        elements: p.type === 'systems' ? [] : await db.all('SELECT * FROM elements WHERE page_id = ? ORDER BY z_index ASC, id ASC', p.id),
      }))
    );
    res.json({ pages: result });
  })
);

// Cria módulo (sempre do tipo "canvas" — os módulos especiais são únicos e criados no cadastro)
router.post(
  '/',
  ah(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome do módulo.' });

    const maxOrderRow = await db.get(
      'SELECT COALESCE(MAX(order_index), -1) as m FROM pages WHERE user_id = ?',
      req.user.account_id
    );

    const inserted = await db.run(
      "INSERT INTO pages (user_id, name, type, order_index) VALUES (?, ?, 'canvas', ?) RETURNING *",
      req.user.account_id,
      name.trim(),
      Number(maxOrderRow.m) + 1
    );

    res.status(201).json({ page: { ...inserted.rows[0], elements: [] } });
  })
);

// Renomeia / reordena módulo
router.put(
  '/:id',
  ah(async (req, res) => {
    const page = await getOwnedPage(req.params.id, req.user.account_id);
    if (!page) return res.status(404).json({ error: 'Módulo não encontrado.' });

    const { name, order_index } = req.body || {};
    const newName = typeof name === 'string' && name.trim() ? name.trim() : page.name;
    const newOrder = typeof order_index === 'number' ? order_index : page.order_index;

    const updated = await db.run(
      'UPDATE pages SET name = ?, order_index = ? WHERE id = ? RETURNING *',
      newName,
      newOrder,
      page.id
    );
    res.json({ page: updated.rows[0] });
  })
);

// Exclui módulo
router.delete(
  '/:id',
  ah(async (req, res) => {
    const page = await getOwnedPage(req.params.id, req.user.account_id);
    if (!page) return res.status(404).json({ error: 'Módulo não encontrado.' });

    const totalRow = await db.get('SELECT COUNT(*) as c FROM pages WHERE user_id = ?', req.user.account_id);
    if (Number(totalRow.c) <= 1) return res.status(400).json({ error: 'É necessário manter ao menos um módulo.' });

    await db.run('DELETE FROM elements WHERE page_id = ?', page.id);
    await db.run('DELETE FROM pages WHERE id = ?', page.id);
    res.json({ ok: true });
  })
);

// Reordena várias páginas de uma vez (drag no menu lateral)
router.put(
  '/',
  ah(async (req, res) => {
    const { order } = req.body || {}; // array de ids na nova ordem
    if (!Array.isArray(order)) return res.status(400).json({ error: 'Ordem inválida.' });

    for (let idx = 0; idx < order.length; idx++) {
      await db.run('UPDATE pages SET order_index = ? WHERE id = ? AND user_id = ?', idx, order[idx], req.user.account_id);
    }
    res.json({ ok: true });
  })
);

// ---- Elementos ----

// Cria elemento em uma página
router.post(
  '/:id/elements',
  ah(async (req, res) => {
    const page = await getOwnedPage(req.params.id, req.user.account_id);
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

    const maxZRow = await db.get('SELECT COALESCE(MAX(z_index), 0) as m FROM elements WHERE page_id = ?', page.id);

    const inserted = await db.run(
      `INSERT INTO elements
        (page_id, type, content, x, y, width, height, font_size, font_color, bg_color, border_radius, font_weight, z_index, placeholder)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       RETURNING *`,
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
      Number(maxZRow.m) + 1,
      placeholder
    );

    res.status(201).json({ element: inserted.rows[0] });
  })
);

async function getOwnedElement(elementId, accountId) {
  return db.get(
    `SELECT e.* FROM elements e
     JOIN pages p ON p.id = e.page_id
     WHERE e.id = ? AND p.user_id = ?`,
    elementId,
    accountId
  );
}

// Atualiza elemento (posição, tamanho, estilo, conteúdo)
router.put(
  '/elements/:elId',
  ah(async (req, res) => {
    const el = await getOwnedElement(req.params.elId, req.user.account_id);
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
    const updated = await db.run(
      `UPDATE elements SET content=?, x=?, y=?, width=?, height=?, font_size=?, font_color=?, bg_color=?, border_radius=?, font_weight=?, z_index=?, placeholder=? WHERE id=? RETURNING *`,
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

    res.json({ element: updated.rows[0] });
  })
);

// Exclui elemento
router.delete(
  '/elements/:elId',
  ah(async (req, res) => {
    const el = await getOwnedElement(req.params.elId, req.user.account_id);
    if (!el) return res.status(404).json({ error: 'Elemento não encontrado.' });
    await db.run('DELETE FROM elements WHERE id = ?', el.id);
    res.json({ ok: true });
  })
);

module.exports = router;
