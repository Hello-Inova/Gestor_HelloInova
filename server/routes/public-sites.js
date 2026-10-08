const express = require('express');
const db = require('../db');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseCategories(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch (err) {
    return [];
  }
}

router.get(
  '/:slug',
  ah(async (req, res) => {
    const account = await db.get(
      'SELECT id, name FROM users WHERE public_slug = ? AND id = account_id',
      String(req.params.slug || '')
    );
    if (!account) return res.status(404).json({ error: 'Página pública não encontrada.' });

    const rows = await db.all(
      `SELECT id, name, url, logo, categories, niche, specifications, updated_at
         FROM systems
        WHERE user_id = ? AND is_public = 1
        ORDER BY name ASC`,
      account.id
    );
    const niches = await db.all(
      `SELECT name FROM system_taxonomies
        WHERE account_id = ? AND kind = 'niche'
        ORDER BY lower(name) ASC`,
      account.id
    );

    res.json({
      account_name: account.name,
      niches: niches.map((item) => item.name),
      systems: rows.map((row) => ({
        id: row.id,
        name: row.name,
        url: row.url,
        logo: row.logo || '',
        categories: parseCategories(row.categories),
        niche: row.niche || '',
        specifications: row.specifications || '',
        updated_at: row.updated_at,
      })),
    });
  })
);

module.exports = router;
