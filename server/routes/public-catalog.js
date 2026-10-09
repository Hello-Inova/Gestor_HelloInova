const express = require('express');
const db = require('../db');
const { isAllowedImageDataUrl } = require('../security');

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
    `SELECT id, name, category, summary, details, price, price_details, images, updated_at
       FROM products WHERE user_id = ? AND is_public = 1 ORDER BY name ASC`,
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
      images: parseImages(row.images),
      updated_at: row.updated_at,
    })),
  });
}));

module.exports = router;
