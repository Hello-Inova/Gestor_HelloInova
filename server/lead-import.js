const XLSX = require('xlsx');

const MAX_IMPORT_ROWS = 1000;
const MAX_FILE_BYTES = 2_500_000;
const MAX_COLUMNS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_SERVICES = ['Landing Page', 'Website', 'Cardápio Digital', 'E-mail Corporativo', 'Outro'];
const VALID_STATUSES = new Set(['novo', 'em_contato', 'convertido', 'perdido']);

const HEADER_ALIASES = {
  name: ['nome', 'nome completo', 'name'],
  whatsapp: ['whatsapp', 'whats app', 'telefone', 'celular', 'phone'],
  email: ['email', 'e mail'],
  services: ['servicos', 'servico', 'services', 'servicos desejados'],
  business_segment: ['segmento', 'ramo', 'ramo de negocio', 'nicho', 'business segment'],
  description: ['descricao', 'necessidade', 'observacoes', 'observacao', 'description'],
  status: ['status', 'situacao'],
};

class LeadImportError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'LeadImportError';
    this.details = details;
  }
}

function cleanText(value, maxLength) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function comparableText(value) {
  return cleanText(value, 500)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeWhatsapp(value) {
  const text = cleanText(value, 40);
  if (!text) return '';
  if (/e\+/i.test(text)) {
    const numeric = Number(text.replace(',', '.'));
    if (Number.isFinite(numeric)) return String(Math.trunc(numeric));
  }
  return text;
}

function whatsappDigits(value) {
  return cleanText(value, 80).replace(/\D/g, '');
}

function duplicateKey(email, whatsapp) {
  return `${cleanText(email, 320).toLowerCase()}|${whatsappDigits(whatsapp)}`;
}

function normalizeStatus(value) {
  const normalized = comparableText(value).replace(/\s+/g, '_');
  const aliases = {
    '': 'novo',
    novo: 'novo',
    em_contato: 'em_contato',
    contato: 'em_contato',
    convertido: 'convertido',
    convertida: 'convertido',
    perdido: 'perdido',
    perdida: 'perdido',
  };
  return aliases[normalized] || null;
}

function normalizeServices(value) {
  const wanted = cleanText(value, 1000)
    .split(/[,;|\n]+/)
    .map((item) => comparableText(item))
    .filter(Boolean);
  const allowed = new Map(VALID_SERVICES.map((service) => [comparableText(service), service]));
  const normalized = wanted.map((item) => allowed.get(item) || 'Outro');
  return [...new Set(normalized)];
}

function buildHeaderMap(headerRow) {
  const aliases = new Map();
  Object.entries(HEADER_ALIASES).forEach(([field, names]) => {
    names.forEach((name) => aliases.set(comparableText(name), field));
  });
  const map = {};
  headerRow.forEach((value, index) => {
    const field = aliases.get(comparableText(value));
    if (field && map[field] === undefined) map[field] = index;
  });
  return map;
}

function findHeader(matrix) {
  let best = null;
  matrix.slice(0, 10).forEach((row, index) => {
    const map = buildHeaderMap(row);
    const score = Object.keys(map).length;
    if (!best || score > best.score) best = { index, map, score };
  });
  const missing = ['name', 'whatsapp', 'email'].filter((field) => best.map[field] === undefined);
  if (missing.length) {
    throw new LeadImportError(
      'A planilha precisa ter as colunas Nome, WhatsApp e E-mail.',
      missing.map((field) => ({ row: 1, message: `Coluna obrigatória ausente: ${field}.` }))
    );
  }
  return best;
}

function isBlankRow(row) {
  return !row.some((value) => cleanText(value, 10_000));
}

function normalizeLeadRow(row, headerMap, sheetRowNumber) {
  const get = (field) => headerMap[field] === undefined ? '' : row[headerMap[field]];
  const name = cleanText(get('name'), 200);
  const whatsapp = normalizeWhatsapp(get('whatsapp'));
  const email = cleanText(get('email'), 320).toLowerCase();
  const businessSegment = cleanText(get('business_segment'), 200);
  const description = cleanText(get('description'), 5000);
  const status = normalizeStatus(get('status'));
  const services = normalizeServices(get('services'));
  const errors = [];

  if (!name) errors.push('Nome não informado.');
  if (!whatsapp || whatsappDigits(whatsapp).length < 8) errors.push('WhatsApp inválido.');
  if (!EMAIL_RE.test(email)) errors.push('E-mail inválido.');
  if (!status) errors.push('Status inválido. Use Novo, Em contato, Convertido ou Perdido.');

  if (errors.length) return { error: { row: sheetRowNumber, message: errors.join(' ') } };

  return {
    lead: {
      name,
      whatsapp,
      email,
      services,
      business_segment: businessSegment,
      business_segment_other: '',
      description,
      source: 'Importação Excel',
      step_completed: services.length || businessSegment || description ? 2 : 1,
      status,
      source_row: sheetRowNumber,
    },
  };
}

function parseLeadWorkbook(buffer, fileName) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new LeadImportError('O arquivo está vazio.');
  if (buffer.length > MAX_FILE_BYTES) throw new LeadImportError('O arquivo deve ter no máximo 2,5 MB.');
  if (!/\.(xlsx|xls)$/i.test(fileName || '')) {
    throw new LeadImportError('Selecione um arquivo Excel no formato .xls ou .xlsx.');
  }

  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      dense: true,
      cellDates: false,
      sheetRows: MAX_IMPORT_ROWS + 12,
    });
  } catch {
    throw new LeadImportError('Não foi possível ler o arquivo. Verifique se ele não está protegido ou corrompido.');
  }

  const sheetName = workbook.SheetNames && workbook.SheetNames[0];
  const sheet = sheetName && workbook.Sheets[sheetName];
  if (!sheet) throw new LeadImportError('A planilha não possui uma aba com dados.');

  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
    range: { s: { r: 0, c: 0 }, e: { r: MAX_IMPORT_ROWS + 10, c: MAX_COLUMNS - 1 } },
  });
  if (!matrix.length) throw new LeadImportError('A primeira aba da planilha está vazia.');

  const header = findHeader(matrix);
  const dataRows = matrix
    .slice(header.index + 1)
    .map((row, index) => ({ row, sheetRowNumber: header.index + index + 2 }))
    .filter(({ row }) => !isBlankRow(row));
  if (!dataRows.length) throw new LeadImportError('A planilha não possui leads abaixo do cabeçalho.');
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new LeadImportError(`Envie no máximo ${MAX_IMPORT_ROWS} leads por arquivo.`);
  }

  const leads = [];
  const errors = [];
  dataRows.forEach(({ row, sheetRowNumber }) => {
    const normalized = normalizeLeadRow(row, header.map, sheetRowNumber);
    if (normalized.error) errors.push(normalized.error);
    else leads.push(normalized.lead);
  });

  return { sheetName, leads, errors, totalRows: dataRows.length };
}

module.exports = {
  MAX_FILE_BYTES,
  MAX_IMPORT_ROWS,
  LeadImportError,
  duplicateKey,
  normalizeLeadRow,
  parseLeadWorkbook,
  whatsappDigits,
};
