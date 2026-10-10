const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { requireAnyModule } = require('../permissions');
const { isAllowedImageDataUrl, normalizeCatalogDestinationUrl } = require('../security');

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
    detail_link_id: row.detail_link_id || null,
    detail_link_name: row.detail_link_name || '',
    detail_url: normalizeCatalogDestinationUrl(row.detail_url) || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function ensureDefaultLink(accountId) {
  await db.run(
    `INSERT INTO product_catalog_links (user_id, name, url)
     VALUES (?, 'Formulário de contato Hello Inova', '/captacao')
     ON CONFLICT (user_id, name) DO NOTHING`,
    accountId
  );
  return db.get(
    `SELECT id, name, url FROM product_catalog_links
     WHERE user_id = ? AND name = 'Formulário de contato Hello Inova'`,
    accountId
  );
}

async function validateFields(body, current = null, accountId) {
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

  let detailLinkId = body.detail_link_id === undefined ? current?.detail_link_id : body.detail_link_id;
  if (detailLinkId === null || detailLinkId === undefined || detailLinkId === '') {
    const defaultLink = await ensureDefaultLink(accountId);
    detailLinkId = defaultLink.id;
  }
  detailLinkId = Number(detailLinkId);
  if (!Number.isInteger(detailLinkId) || detailLinkId < 1) return { error: 'Selecione um link de destino válido.' };
  const ownedLink = await db.get(
    'SELECT id FROM product_catalog_links WHERE id = ? AND user_id = ?',
    detailLinkId,
    accountId
  );
  if (!ownedLink) return { error: 'O link de destino selecionado não existe.' };

  return {
    value: {
      name: name.slice(0, 200),
      category: (typeof body.category === 'string' ? body.category : current?.category || '').trim().slice(0, 80),
      summary: (typeof body.summary === 'string' ? body.summary : current?.summary || '').trim().slice(0, 400),
      details: (typeof body.details === 'string' ? body.details : current?.details || '').trim().slice(0, 6000),
      observations: (typeof body.observations === 'string' ? body.observations : current?.observations || '').trim().slice(0, 4000),
      price,
      price_details: (typeof body.price_details === 'string' ? body.price_details : current?.price_details || '').trim().slice(0, 600),
      images: imageResult.images === undefined ? parseStoredImages(current?.images) : imageResult.images,
      is_public: typeof body.is_public === 'boolean' ? (body.is_public ? 1 : 0) : (current?.is_public || 0),
      detail_link_id: detailLinkId,
    },
  };
}

async function getOwned(id, accountId) {
  return db.get(
    `SELECT p.*, l.name AS detail_link_name, l.url AS detail_url
       FROM products p
       LEFT JOIN product_catalog_links l ON l.id = p.detail_link_id AND l.user_id = p.user_id
      WHERE p.id = ? AND p.user_id = ?`,
    id,
    accountId
  );
}

router.get('/options', ah(async (req, res) => {
  const owner = await db.get('SELECT public_slug FROM users WHERE id = ?', req.user.account_id);
  await ensureDefaultLink(req.user.account_id);
  const links = await db.all(
    'SELECT id, name, url FROM product_catalog_links WHERE user_id = ? ORDER BY name ASC, id ASC',
    req.user.account_id
  );
  res.json({
    public_url: `${req.protocol}://${req.get('host')}/catalogo/${owner.public_slug}`,
    links,
  });
}));

router.post('/links', ah(async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : '';
  const url = normalizeCatalogDestinationUrl(req.body?.url);
  if (!name) return res.status(400).json({ error: 'Informe um nome para identificar o link.' });
  if (!url) return res.status(400).json({ error: 'Informe um link HTTP, HTTPS ou um caminho interno válido.' });
  const duplicate = await db.get(
    'SELECT id FROM product_catalog_links WHERE user_id = ? AND LOWER(name) = LOWER(?)',
    req.user.account_id,
    name
  );
  if (duplicate) return res.status(409).json({ error: 'Já existe um link com esse nome.' });
  const inserted = await db.run(
    'INSERT INTO product_catalog_links (user_id, name, url) VALUES (?, ?, ?) RETURNING id, name, url',
    req.user.account_id,
    name,
    url
  );
  res.status(201).json({ link: inserted.rows[0] });
}));

router.get('/', ah(async (req, res) => {
  const rows = await db.all(
    `SELECT p.*, l.name AS detail_link_name, l.url AS detail_url
       FROM products p
       LEFT JOIN product_catalog_links l ON l.id = p.detail_link_id AND l.user_id = p.user_id
      WHERE p.user_id = ? ORDER BY p.updated_at DESC, p.id DESC`,
    req.user.account_id
  );
  res.json({ products: rows.map(serializeProduct) });
}));

router.post('/', ah(async (req, res) => {
  const validated = await validateFields(req.body || {}, null, req.user.account_id);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const value = validated.value;
  const inserted = await db.run(
    `INSERT INTO products
      (user_id, name, category, summary, details, observations, price, price_details, images, is_public, detail_link_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    req.user.account_id,
    value.name,
    value.category,
    value.summary,
    value.details,
    value.observations,
    value.price,
    value.price_details,
    JSON.stringify(value.images),
    value.is_public,
    value.detail_link_id
  );
  res.status(201).json({ product: serializeProduct(await getOwned(inserted.rows[0].id, req.user.account_id)) });
}));

router.put('/:id', ah(async (req, res) => {
  const current = await getOwned(req.params.id, req.user.account_id);
  if (!current) return res.status(404).json({ error: 'Solução não encontrada.' });
  const validated = await validateFields(req.body || {}, current, req.user.account_id);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const value = validated.value;
  const updated = await db.run(
    `UPDATE products SET name=?, category=?, summary=?, details=?, observations=?, price=?,
       price_details=?, images=?, is_public=?, detail_link_id=?, updated_at=NOW() WHERE id=? RETURNING id`,
    value.name,
    value.category,
    value.summary,
    value.details,
    value.observations,
    value.price,
    value.price_details,
    JSON.stringify(value.images),
    value.is_public,
    value.detail_link_id,
    current.id
  );
  res.json({ product: serializeProduct(await getOwned(updated.rows[0].id, req.user.account_id)) });
}));

router.delete('/:id', ah(async (req, res) => {
  const current = await getOwned(req.params.id, req.user.account_id);
  if (!current) return res.status(404).json({ error: 'Solução não encontrada.' });
  await db.run('DELETE FROM products WHERE id = ?', current.id);
  res.json({ ok: true });
}));

module.exports = router;
