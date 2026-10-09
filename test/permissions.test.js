const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MODULE_CATALOG,
  parseModulePermissions,
  serializeUserAccess,
  hasModuleAccess,
  requireAdmin,
  requireAnyModule,
} = require('../server/permissions');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('administrador recebe acesso a todos os módulos', () => {
  const access = serializeUserAccess({ role: 'admin', module_permissions: '[]' });
  assert.deepEqual(access.module_permissions, MODULE_CATALOG.map((module) => module.id));
  assert.equal(hasModuleAccess({ role: 'admin' }, 'candidates'), true);
});

test('perfil de vendas recebe somente permissões válidas e sem duplicidade', () => {
  assert.deepEqual(
    parseModulePermissions('["leads","leads","invalid","candidates"]'),
    ['leads', 'candidates']
  );
  assert.equal(hasModuleAccess({ role: 'vendas', module_permissions: ['leads'] }, 'leads'), true);
  assert.equal(hasModuleAccess({ role: 'vendas', module_permissions: ['leads'] }, 'systems'), false);
});

test('middlewares bloqueiam administração e módulos não permitidos', () => {
  const adminRes = response();
  requireAdmin({ user: { role: 'vendas' } }, adminRes, () => {});
  assert.equal(adminRes.statusCode, 403);

  const moduleRes = response();
  requireAnyModule('systems')(
    { user: { role: 'vendas', module_permissions: ['leads'] } },
    moduleRes,
    () => {}
  );
  assert.equal(moduleRes.statusCode, 403);
});
