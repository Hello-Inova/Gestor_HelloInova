const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif);base64,/i;

function applySecurityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  });
  if (process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
}

function isSameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return req.get('sec-fetch-site') !== 'cross-site';
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

function protectUnsafeRequests(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.method === 'POST' && ['/api/candidates', '/api/candidates/'].includes(req.path)) return next();
  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Origem da requisição não permitida.' });
  }
  const expectsJsonBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
  if (expectsJsonBody && req.path.startsWith('/api/') && !req.is('application/json')) {
    return res.status(415).json({ error: 'Envie os dados no formato JSON.' });
  }
  next();
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    return 'A senha deve ter ao menos 12 caracteres.';
  }
  if (password.length > 128) return 'A senha deve ter no máximo 128 caracteres.';
  return '';
}

function normalizeHttpUrl(value, { required = false } = {}) {
  if (typeof value !== 'string') return required ? null : '';
  const trimmed = value.trim();
  if (!trimmed) return required ? null : '';
  if (trimmed.length > 2000) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function isAllowedImageDataUrl(value) {
  return typeof value === 'string' && ALLOWED_IMAGE_DATA_URL.test(value);
}

module.exports = {
  applySecurityHeaders,
  protectUnsafeRequests,
  validatePassword,
  normalizeHttpUrl,
  isAllowedImageDataUrl,
  isSameOrigin,
};
