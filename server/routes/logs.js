const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { requireAdmin } = require('../permissions');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function canAuditUser(accountId, userId) {
  return db.get(
    `SELECT 1 AS allowed
       FROM users WHERE id = ? AND account_id = ?
     UNION ALL
     SELECT 1 AS allowed
       FROM activity_logs WHERE actor_user_id = ? AND account_id = ?
     LIMIT 1`,
    userId,
    accountId,
    userId,
    accountId
  );
}

router.get('/users', ah(async (req, res) => {
  const currentUsers = await db.all(
    `SELECT u.id, u.name, u.email, u.role, u.is_active, u.last_login_at,
            MAX(l.created_at) AS last_action_at,
            COUNT(l.id)::int AS action_count
       FROM users u
       LEFT JOIN activity_logs l
         ON l.account_id = u.account_id AND l.actor_user_id = u.id
      WHERE u.account_id = ?
      GROUP BY u.id
      ORDER BY lower(u.name), u.id`,
    req.user.account_id
  );
  const deletedUsers = await db.all(
    `SELECT DISTINCT ON (l.actor_user_id)
            l.actor_user_id AS id, l.actor_name AS name, l.actor_email AS email,
            'excluido' AS role, 0 AS is_active,
            (SELECT MAX(login.created_at) FROM activity_logs login
              WHERE login.account_id = l.account_id
                AND login.actor_user_id = l.actor_user_id
                AND login.action_type = 'Login') AS last_login_at,
            l.created_at AS last_action_at,
            (SELECT COUNT(*)::int FROM activity_logs c
              WHERE c.account_id = l.account_id AND c.actor_user_id = l.actor_user_id) AS action_count
       FROM activity_logs l
      WHERE l.account_id = ?
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = l.actor_user_id)
      ORDER BY l.actor_user_id, l.created_at DESC`,
    req.user.account_id
  );
  res.json({
    users: [...currentUsers, ...deletedUsers].map((user) => ({
      ...user,
      is_active: user.is_active !== 0 && user.is_active !== false,
      is_deleted: user.role === 'excluido',
    })),
  });
}));

router.get('/action-types', ah(async (req, res) => {
  const userId = Number(req.query.user_id);
  if (!Number.isInteger(userId) || userId <= 0 || !(await canAuditUser(req.user.account_id, userId))) {
    return res.status(400).json({ error: 'Selecione um usuário válido.' });
  }
  const rows = await db.all(
    `SELECT DISTINCT action_type
       FROM activity_logs
      WHERE account_id = ? AND actor_user_id = ?
      ORDER BY action_type`,
    req.user.account_id,
    userId
  );
  res.json({ action_types: rows.map((row) => row.action_type) });
}));

router.get('/', ah(async (req, res) => {
  const userId = Number(req.query.user_id);
  if (!Number.isInteger(userId) || userId <= 0 || !(await canAuditUser(req.user.account_id, userId))) {
    return res.status(400).json({ error: 'Selecione um usuário válido.' });
  }

  const action = typeof req.query.action === 'string' ? req.query.action.trim().slice(0, 80) : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
  const limit = Math.floor(Math.min(Math.max(Number(req.query.limit) || 100, 1), 250));
  const offset = Math.floor(Math.max(Number(req.query.offset) || 0, 0));
  const conditions = ['account_id = ?', 'actor_user_id = ?'];
  const params = [req.user.account_id, userId];

  if (action) {
    conditions.push('action_type ILIKE ?');
    params.push(`%${action}%`);
  }
  if (search) {
    conditions.push('(description ILIKE ? OR path ILIKE ? OR action_type ILIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  const where = conditions.join(' AND ');
  const countRow = await db.get(`SELECT COUNT(*)::int AS total FROM activity_logs WHERE ${where}`, ...params);
  const rows = await db.all(
    `SELECT id, actor_user_id, actor_name, actor_email, action_type, description,
            method, path, status_code, created_at
       FROM activity_logs
      WHERE ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset
  );
  res.json({ logs: rows, total: Number(countRow.total) || 0, limit, offset });
}));

module.exports = router;
