const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { requireAnyModule } = require('../permissions');
const { isAllowedImageDataUrl } = require('../security');

const router = express.Router();
router.use(requireAuth);
router.use(requireAnyModule('catalog'));

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const MAX_IMAGES = 5;
const MAX_IMAGE_LENGTH = 700_000;
const MAX_TOTAL_IMAGE_LENGTH = 3_500_000;

function parseImages(input) {
  if (input === undefined) return { ok: true, images: undefined };
  if (!Array.isArray(input)) return { ok: false, error: 'Galeria de imagens inválida.' };
  if (input.length > MAX_IMAGES) return { ok: false, error: 'Envie no máximo 5 imagens por solução.' };
  const images = input.filter(Boolean);
  if (images.some((image) => typeof image !== 'string' || image.length > MAX_IMAGE_LENGTH || !isAllowedImageDataUrl(image))) {
    return { ok: false, error: 'Cada imagem deve ser PNG, JPG, WEBP ou GIF e ter no máximo cerca de 500 KB.' };
  }
  if (images.reduce((sum, image) => sum + image.length, 0) > MAX_TOTAL_IMAGE_LENGTH) {
    return { ok: false, error: 'O conjunto de imagens excede o limite permitido.' };
  }
  return { ok: true, images };
}

function parseStoredImages(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((image) => typeof image === 'string' && isAllowedImageDataUrl(image)) : [];
  } catch {
    return [];
  }
}

function serializeProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category || '',
    summary: row.summary || '',
    details: row.details || '',
    observations: row.observations || '',
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    price_details: row.price_details || '',
    images: parseStoredImages(row.images),
    is_public: !!row.is_public,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validateFields(body, current = null) {
  const name = typeof body.name === 'string' ? body.name.trim() : current?.name || '';
  if (!name) return { error: 'Informe o nome da solução.' };

  let price = body.price;
  if (price === undefined && current) price = current.price;
  if (price === '' || price === null || price === undefined) price = null;
  else {
    price = Number(price);
    if (!Number.isFinite(price) || price < 0 || price > 9999999999.99) {
      return { error: 'Informe um valor válido.' };
    }
  }

  const imageResult = parseImages(body.images);
  if (!imageResult.ok) return { error: imageResult.error };
  return {
    value: {
      name: name.slice(0, 200),
      category: (typeof body.category === 'string' ? body.category : current?.category || '').trim().slice(0, 80),
      summary: (typeof body.summary === 'string' ? body.summary : current?.summary || '').trim().slice(0, 400),
      details: (typeof body.details === 'string' ? body.details : current?.details || '').trim().slice(0, 6000),
      observations: (typeof body.observations === 'string' ? body.observations : current?.observations || '').trim().slice(0, 4000),
      price,
      price_details: (typeof body.price_details === 'string' ? body.price_details : current?.price_details || '').trim().slice(0, 300),
      images: imageResult.images === undefined ? parseStoredImages(current?.images) : imageResult.images,
      is_public: typeof body.is_public === 'boolean' ? (body.is_public ? 1 : 0) : (current?.is_public || 0),
    },
  };
}

async function getOwned(id, accountId) {
  return db.get('SELECT * FROM products WHERE id = ? AND user_id = ?', id, accountId);
}

router.get('/options', ah(async (req, res) => {
  const owner = await db.get('SELECT public_slug FROM users WHERE id = ?', req.user.account_id);
  res.json({ public_url: `${req.protocol}://${req.get('host')}/catalogo/${owner.public_slug}` });
}));

router.get('/', ah(async (req, res) => {
  const rows = await db.all('SELECT * FROM products WHERE user_id = ? ORDER BY updated_at DESC, id DESC', req.user.account_id);
  res.json({ products: rows.map(serializeProduct) });
}));

router.post('/', ah(async (req, res) => {
  const validated = validateFields(req.body || {});
  if (validated.error) return res.status(400).json({ error: validated.error });
  const value = validated.value;
  const inserted = await db.run(
    `INSERT INTO products
      (user_id, name, category, summary, details, observations, price, price_details, images, is_public)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    req.user.account_id,
    value.name,
    value.category,
    value.summary,
    value.details,
    value.observations,
    value.price,
    value.price_details,
    JSON.stringify(value.images),
    value.is_public
  );
  res.status(201).json({ product: serializeProduct(inserted.rows[0]) });
}));

router.put('/:id', ah(async (req, res) => {
  const current = await getOwned(req.params.id, req.user.account_id);
  if (!current) return res.status(404).json({ error: 'Solução não encontrada.' });
  const validated = validateFields(req.body || {}, current);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const value = validated.value;
  const updated = await db.run(
    `UPDATE products SET name=?, category=?, summary=?, details=?, observations=?, price=?,
       price_details=?, images=?, is_public=?, updated_at=NOW() WHERE id=? RETURNING *`,
    value.name,
    value.category,
    value.summary,
    value.details,
    value.observations,
    value.price,
    value.price_details,
    JSON.stringify(value.images),
    value.is_public,
    current.id
  );
  res.json({ product: serializeProduct(updated.rows[0]) });
}));

router.delete('/:id', ah(async (req, res) => {
  const current = await getOwned(req.params.id, req.user.account_id);
  if (!current) return res.status(404).json({ error: 'Solução não encontrada.' });
  await db.run('DELETE FROM products WHERE id = ?', current.id);
  res.json({ ok: true });
}));

module.exports = router;
