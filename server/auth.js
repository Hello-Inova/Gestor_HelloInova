const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'helloinova-dev-secret-troque-em-producao';
const COOKIE_NAME = 'hi_session';

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
    { id: user.id, email: user.email, name: user.name, account_id: user.account_id },
    JWT_SECRET,
    { expiresIn: SESSION_TTL_SECONDS }
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    // Renova a sessão (janela deslizante) a cada requisição autenticada.
    const fresh = signToken(payload);
    setAuthCookie(res, fresh);
    next();
  } catch (err) {
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
