const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const configuredSecret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error('JWT_SECRET deve ter ao menos 32 caracteres em produção.');
}
const JWT_SECRET = configuredSecret || 'helloinova-apenas-desenvolvimento-local';
const COOKIE_NAME = 'hi_session';
const JWT_OPTIONS = { algorithm: 'HS256', issuer: 'hello-inova', audience: 'gestor-hello-inova' };

// Sessão de longa duração, sem logout automático por inatividade: o token
// dura 7 dias e toda requisição autenticada (requireAuth) emite um novo
// token com mais 7 dias, renovando o cookie (janela deslizante). Ou seja, a
// pessoa continua logada mesmo depois de dias sem usar o sistema, desde que
// volte a acessar antes do prazo expirar — só é exigido login novamente se
// ficar 7 dias inteiros sem nenhuma requisição, ou ao fazer logout manual.
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      account_id: user.account_id,
      session_version: Number(user.session_version || 0),
    },
    JWT_SECRET,
    { ...JWT_OPTIONS, expiresIn: SESSION_TTL_SECONDS }
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
    priority: 'high',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

async function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET, JWT_OPTIONS);
    const activeUser = await db.get(
      'SELECT id, email, name, account_id, session_version FROM users WHERE id = ?',
      payload.id
    );
    if (!activeUser || Number(payload.session_version) !== Number(activeUser.session_version)) {
      clearAuthCookie(res);
      return res.status(401).json({ error: 'Sessão inválida. Faça login novamente.' });
    }
    req.user = activeUser;
    // Renova a sessão (janela deslizante) a cada requisição autenticada.
    const fresh = signToken(activeUser);
    setAuthCookie(res, fresh);
    next();
  } catch (err) {
    if (err && !['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(err.name)) {
      return next(err);
    }
    clearAuthCookie(res);
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
};
