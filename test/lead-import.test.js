const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const {
  LeadImportError,
  duplicateKey,
  parseLeadWorkbook,
} = require('../server/lead-import');

function workbookBuffer(rows, bookType = 'xlsx') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Leads');
  return XLSX.write(workbook, { type: 'buffer', bookType });
}

test('importa XLSX com cabeçalhos em português e campos opcionais', () => {
  const buffer = workbookBuffer([
    ['Nome', 'WhatsApp', 'E-mail', 'Serviços', 'Segmento', 'Descrição', 'Status'],
    ['Maria Silva', '(11) 99999-0000', 'MARIA@EXEMPLO.COM', 'Website; Landing Page', 'Varejo', 'Novo site', 'Em contato'],
  ]);
  const parsed = parseLeadWorkbook(buffer, 'leads.xlsx');
  assert.equal(parsed.totalRows, 1);
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.leads[0], {
    name: 'Maria Silva',
    whatsapp: '(11) 99999-0000',
    email: 'maria@exemplo.com',
    services: ['Website', 'Landing Page'],
    business_segment: 'Varejo',
    business_segment_other: '',
    description: 'Novo site',
    source: 'Importação Excel',
    step_completed: 2,
    status: 'em_contato',
    source_row: 2,
  });
});

test('aceita arquivo XLS legado', () => {
  const buffer = workbookBuffer([
    ['Nome', 'Telefone', 'Email'],
    ['João Souza', '11987654321', 'joao@exemplo.com'],
  ], 'biff8');
  const parsed = parseLeadWorkbook(buffer, 'leads.xls');
  assert.equal(parsed.leads.length, 1);
  assert.equal(parsed.leads[0].status, 'novo');
});

test('rejeita linhas inválidas e exige as três colunas obrigatórias', () => {
  const invalidRows = workbookBuffer([
    ['Nome', 'WhatsApp', 'E-mail'],
    ['', '123', 'invalido'],
  ]);
  const parsed = parseLeadWorkbook(invalidRows, 'leads.xlsx');
  assert.equal(parsed.leads.length, 0);
  assert.match(parsed.errors[0].message, /Nome não informado/);

  const missingColumn = workbookBuffer([['Nome', 'E-mail'], ['Ana', 'ana@exemplo.com']]);
  assert.throws(
    () => parseLeadWorkbook(missingColumn, 'leads.xlsx'),
    (err) => err instanceof LeadImportError && /WhatsApp/.test(err.message)
  );
});

test('chave de duplicidade normaliza e-mail e telefone', () => {
  assert.equal(
    duplicateKey(' Pessoa@Exemplo.com ', '(11) 9 9999-0000'),
    'pessoa@exemplo.com|11999990000'
  );
});
