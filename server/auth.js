const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'helloinova-dev-secret-troque-em-producao';
const COOKIE_NAME = 'hi_session';

// Sessão com expiração deslizante: o token dura 15 minutos, mas toda
// requisição autenticada (requireAuth) emite um novo token com mais 15
// minutos e reseta o cookie. Ou seja, enquanto a pessoa estiver usando o
// sistema a sessão nunca expira — mas 15 minutos sem nenhuma requisição
// (aba fechada, computador hibernando, etc.) derruba a sessão e exige
// login novamente. Isso implementa o "logout automático por inatividade".
const SESSION_TTL_SECONDS = 15 * 60;

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
    return res.status(401).json({ error: 'Sessão expirada por inatividade. Faça login novamente.' });
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
