const db = require('./db');

const RESOURCE_LABELS = [
  [/\/api\/auth\/users/, 'usuários'],
  [/\/api\/systems/, 'sistemas'],
  [/\/api\/leads/, 'leads'],
  [/\/api\/candidates/, 'candidatos'],
  [/\/api\/products/, 'soluções do catálogo'],
  [/\/api\/public-sites/, 'sites públicos'],
  [/\/api\/public-catalog/, 'catálogo público'],
  [/\/api\/dashboard/, 'dashboard'],
  [/\/api\/pages/, 'módulos'],
  [/\/api\/auth\/logout/, 'sessão'],
];

function resourceFor(path) {
  const match = RESOURCE_LABELS.find(([pattern]) => pattern.test(path));
  return match ? match[1] : 'sistema';
}

function describeAction(req) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = String(req.originalUrl || req.path || '').split('?')[0].slice(0, 500);
  const resource = resourceFor(path);

  if (method === 'POST') return { actionType: 'Cadastro', description: `Cadastrou dados em ${resource}`, path };
  if (method === 'PUT' || method === 'PATCH') return { actionType: 'Edição', description: `Editou dados em ${resource}`, path };
  if (method === 'DELETE') return { actionType: 'Exclusão', description: `Excluiu dados em ${resource}`, path };
  return null;
}

function shouldAudit(req) {
  const path = String(req.originalUrl || req.path || '').split('?')[0];
  if (!path.startsWith('/api/')) return false;
  if (path.startsWith('/api/logs')) return false;
  if (path.startsWith('/api/auth/') && !path.startsWith('/api/auth/users')) return false;
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method || '').toUpperCase());
}

async function recordAudit({ user, actionType, description, method, path, statusCode = 200 }) {
  if (!user || !user.id || !user.account_id || user.role === 'admin') return;
  await db.run(
    `INSERT INTO activity_logs
       (account_id, actor_user_id, actor_name, actor_email, action_type, description, method, path, status_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    user.account_id,
    user.id,
    String(user.name || 'Usuário').slice(0, 200),
    String(user.email || '').slice(0, 320),
    String(actionType || 'Ação').slice(0, 80),
    String(description || 'Executou uma ação').slice(0, 500),
    String(method || 'GET').slice(0, 10),
    String(path || '/').slice(0, 500),
    Number(statusCode) || 200
  );
}

function auditAuthenticatedResponse(req, res, user) {
  if (!shouldAudit(req) || res.locals.auditWrapped || !user || user.role === 'admin') return;
  res.locals.auditWrapped = true;
  const originalEnd = res.end;
  let ended = false;
  res.end = function auditedEnd(chunk, encoding, callback) {
    if (ended) return undefined;
    ended = true;
    res.end = originalEnd;
    const details = describeAction(req);
    const succeeded = res.statusCode >= 200 && res.statusCode < 400;
    if (!details || !succeeded) return originalEnd.call(res, chunk, encoding, callback);
    return recordAudit({
      user,
      actionType: details.actionType,
      description: details.description,
      method: req.method,
      path: details.path,
      statusCode: res.statusCode,
    }).catch((err) => {
      console.error('[audit] Não foi possível registrar a ação:', err.message);
    }).finally(() => originalEnd.call(res, chunk, encoding, callback));
  };
}

async function recordLogin(user) {
  await db.run('UPDATE users SET last_login_at = NOW() WHERE id = ?', user.id);
}

module.exports = { auditAuthenticatedResponse, recordAudit, recordLogin };
