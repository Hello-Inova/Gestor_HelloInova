const MODULE_CATALOG = Object.freeze([
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'systems', label: 'Gestor de Sistemas' },
  { id: 'public_sites', label: 'Sites públicos' },
  { id: 'leads', label: 'Leads' },
  { id: 'candidates', label: 'Candidatos' },
]);
const MODULE_IDS = new Set(MODULE_CATALOG.map((module) => module.id));
const VALID_ROLES = new Set(['admin', 'vendas']);

function normalizeRole(role) {
  return VALID_ROLES.has(role) ? role : 'vendas';
}

function parseModulePermissions(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value || '[]'); } catch { parsed = []; }
  }
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.filter((permission) => MODULE_IDS.has(permission)))];
}

function serializeUserAccess(user) {
  const role = normalizeRole(user.role);
  return {
    role,
    module_permissions: role === 'admin'
      ? MODULE_CATALOG.map((module) => module.id)
      : parseModulePermissions(user.module_permissions),
  };
}

function hasModuleAccess(user, moduleId) {
  const access = serializeUserAccess(user || {});
  return access.role === 'admin' || access.module_permissions.includes(moduleId);
}

function requireAdmin(req, res, next) {
  if (normalizeRole(req.user?.role) !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem realizar esta ação.' });
  }
  next();
}

function requireAnyModule(...moduleIds) {
  return (req, res, next) => {
    if (!moduleIds.some((moduleId) => hasModuleAccess(req.user, moduleId))) {
      return res.status(403).json({ error: 'Seu perfil não possui acesso a este módulo.' });
    }
    next();
  };
}

module.exports = {
  MODULE_CATALOG,
  MODULE_IDS,
  VALID_ROLES,
  normalizeRole,
  parseModulePermissions,
  serializeUserAccess,
  hasModuleAccess,
  requireAdmin,
  requireAnyModule,
};
