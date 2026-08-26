const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { SYSTEM_CATEGORIES } = require('../categories');

const router = express.Router();
router.use(requireAuth);

// Express 4 não encaminha automaticamente rejeições de handlers async para o
// middleware de erro — sem isso, um erro depois de um "await" faria a
// requisição travar sem resposta.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Resumo gerencial/financeiro: total de sistemas, total de assinaturas
// (quantidade e valor somado) e quantidade de sistemas por categoria.
router.get('/summary', ah(async (req, res) => {
  const rows = await db.all('SELECT categories, subscriptions FROM systems WHERE user_id = ?', req.user.account_id);

  let subscriptionsCount = 0;
  let subscriptionsValue = 0;
  const categoryCounts = {};
  SYSTEM_CATEGORIES.forEach((c) => { categoryCounts[c] = 0; });
  let uncategorized = 0;

  for (const row of rows) {
    let categories = [];
    try {
      const parsed = JSON.parse(row.categories || '[]');
      if (Array.isArray(parsed)) categories = parsed.filter((c) => SYSTEM_CATEGORIES.includes(c));
    } catch (e) { /* ignora categorias inválidas */ }

    if (categories.length) {
      categories.forEach((c) => { categoryCounts[c] = (categoryCounts[c] || 0) + 1; });
    } else {
      uncategorized += 1;
    }

    let subscriptions = [];
    try {
      const parsed = JSON.parse(row.subscriptions || '[]');
      if (Array.isArray(parsed)) subscriptions = parsed;
    } catch (e) { /* ignora assinaturas inválidas */ }

    subscriptionsCount += subscriptions.length;
    subscriptionsValue += subscriptions.reduce(
      (sum, s) => sum + (typeof s.value === 'number' && !isNaN(s.value) ? s.value : 0),
      0
    );
  }

  res.json({
    systems_total: rows.length,
    subscriptions_total_count: subscriptionsCount,
    subscriptions_total_value: subscriptionsValue,
    categories: SYSTEM_CATEGORIES.map((c) => ({ category: c, count: categoryCounts[c] || 0 })),
    uncategorized_count: uncategorized,
  });
}));

module.exports = router;
