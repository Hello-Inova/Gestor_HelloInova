const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validatePassword,
  normalizeHttpUrl,
  isAllowedImageDataUrl,
  isSameOrigin,
  protectUnsafeRequests,
} = require('../server/security');

function request(headers = {}, overrides = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    method: 'POST',
    path: '/api/systems',
    get(name) { return normalized[name.toLowerCase()]; },
    is(type) { return type === 'application/json' && normalized['content-type'] === 'application/json'; },
    ...overrides,
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('política de senha rejeita valores curtos e excessivos', () => {
  assert.match(validatePassword('curta'), /12 caracteres/);
  assert.equal(validatePassword('a'.repeat(12)), '');
  assert.match(validatePassword('a'.repeat(129)), /128 caracteres/);
});

test('URLs são limitadas a HTTP e HTTPS', () => {
  assert.equal(normalizeHttpUrl('example.com'), 'https://example.com/');
  assert.equal(normalizeHttpUrl('https://hello-inova.com/path'), 'https://hello-inova.com/path');
  assert.equal(normalizeHttpUrl('javascript:alert(1)'), null);
  assert.equal(normalizeHttpUrl('data:text/html,test'), null);
  assert.equal(normalizeHttpUrl('', { required: true }), null);
});

test('uploads de imagem aceitam apenas formatos raster conhecidos', () => {
  assert.equal(isAllowedImageDataUrl('data:image/png;base64,AAAA'), true);
  assert.equal(isAllowedImageDataUrl('data:image/webp;base64,AAAA'), true);
  assert.equal(isAllowedImageDataUrl('data:image/svg+xml;base64,AAAA'), false);
});

test('comparação de origem permite apenas o mesmo host', () => {
  assert.equal(isSameOrigin(request({ origin: 'https://gestor.exemplo.com', host: 'gestor.exemplo.com' })), true);
  assert.equal(isSameOrigin(request({ origin: 'https://ataque.exemplo', host: 'gestor.exemplo.com' })), false);
  assert.equal(isSameOrigin(request({ 'sec-fetch-site': 'cross-site', host: 'gestor.exemplo.com' })), false);
});

test('middleware bloqueia mutação cross-site e conteúdo não JSON', () => {
  let nextCalled = false;
  const crossSiteRes = response();
  protectUnsafeRequests(
    request({ origin: 'https://ataque.exemplo', host: 'gestor.exemplo.com', 'content-type': 'application/json' }),
    crossSiteRes,
    () => { nextCalled = true; }
  );
  assert.equal(crossSiteRes.statusCode, 403);
  assert.equal(nextCalled, false);

  const formRes = response();
  protectUnsafeRequests(
    request({ origin: 'https://gestor.exemplo.com', host: 'gestor.exemplo.com', 'content-type': 'text/plain' }),
    formRes,
    () => { nextCalled = true; }
  );
  assert.equal(formRes.statusCode, 415);
});
