const crypto = require('node:crypto');
const db = require('./db');

function clientKey(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown').replace('::ffff:', '');
  return crypto.createHash('sha256').update(ip).digest('hex');
}

function rateLimit({ name, max, windowMinutes }) {
  if (!/^[a-z0-9_-]+$/.test(name) || !Number.isInteger(max) || !Number.isInteger(windowMinutes)) {
    throw new Error('Configuração inválida de rate limit.');
  }
  return async function rateLimitMiddleware(req, res, next) {
    try {
      const key = clientKey(req);
      const current = await db.get(
        `SELECT COUNT(*) AS count FROM request_rate_limits
         WHERE route = ? AND client_key = ?
           AND created_at >= NOW() - INTERVAL '${windowMinutes} minutes'`,
        name,
        key
      );
      if (Number(current.count) >= max) {
        res.set('Retry-After', String(windowMinutes * 60));
        return res.status(429).json({ error: 'Muitas solicitações. Aguarde alguns minutos e tente novamente.' });
      }
      await db.run(
        'INSERT INTO request_rate_limits (route, client_key) VALUES (?, ?)',
        name,
        key
      );
      // Limpeza oportunista mantém a tabela limitada sem depender de cron.
      if (Math.random() < 0.02) {
        await db.run("DELETE FROM request_rate_limits WHERE created_at < NOW() - INTERVAL '1 day'");
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { rateLimit, clientKey };
