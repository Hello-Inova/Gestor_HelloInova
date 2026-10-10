const express = require('express');
const db = require('../db');
const { isAllowedImageDataUrl, normalizeCatalogDestinationUrl } = require('../security');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseImages(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((image) => typeof image === 'string' && isAllowedImageDataUrl(image)).slice(0, 5) : [];
  } catch {
    return [];
  }
}

router.get('/:slug', ah(async (req, res) => {
  const slug = String(req.params.slug || '');
  if (!/^[a-f0-9]{32}$/.test(slug)) return res.status(404).json({ error: 'Catálogo não encontrado.' });
  res.set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  const account = await db.get('SELECT id, name FROM users WHERE public_slug = ? AND id = account_id', slug);
  if (!account) return res.status(404).json({ error: 'Catálogo não encontrado.' });
  const rows = await db.all(
    `SELECT p.id, p.name, p.category, p.summary, p.details, p.price, p.price_details,
            p.logo, p.images, p.updated_at, l.url AS detail_url
       FROM products p
       LEFT JOIN product_catalog_links l ON l.id = p.detail_link_id AND l.user_id = p.user_id
      WHERE p.user_id = ? AND p.is_public = 1 ORDER BY p.name ASC`,
    account.id
  );
  res.json({
    account_name: account.name,
    products: rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category || '',
      summary: row.summary || '',
      details: row.details || '',
      price: row.price === null || row.price === undefined ? null : Number(row.price),
      price_details: row.price_details || '',
      logo: typeof row.logo === 'string' && isAllowedImageDataUrl(row.logo) ? row.logo : '',
      images: parseImages(row.images),
      detail_url: normalizeCatalogDestinationUrl(row.detail_url) || '/captacao',
      updated_at: row.updated_at,
    })),
  });
}));

module.exports = router;
