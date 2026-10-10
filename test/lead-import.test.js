const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const {
  LeadImportError,
  createLeadImportTemplateBuffer,
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
    ['Nome completo', 'WhatsApp', 'E-mail', 'Serviço desejado', 'Ramo de negócio', 'Descrição da necessidade', 'Link do Instagram', 'Nome do responsável pelo negócio', 'Contato do responsável', 'Status'],
    ['Maria Silva', '(11) 99999-0000', 'MARIA@EXEMPLO.COM', 'Website; Automação comercial', 'Varejo', 'Novo site', 'https://instagram.com/empresa', 'Carlos Silva', '(11) 98888-7777', 'Em contato'],
  ]);
  const parsed = parseLeadWorkbook(buffer, 'leads.xlsx');
  assert.equal(parsed.totalRows, 1);
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.leads[0], {
    name: 'Maria Silva',
    whatsapp: '(11) 99999-0000',
    email: 'maria@exemplo.com',
    services: ['Website', 'Automação comercial'],
    business_segment: 'Varejo',
    business_segment_other: '',
    description: 'Novo site',
    instagram_url: 'https://instagram.com/empresa',
    responsible_name: 'Carlos Silva',
    responsible_contact: '(11) 98888-7777',
    source: 'Importação Excel',
    step_completed: 2,
    status: 'em_contato',
    source_row: 2,
  });
});

test('gera modelo XLSX com todos os campos aceitos pelo importador', () => {
  const workbook = XLSX.read(createLeadImportTemplateBuffer(), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Leads, { header: 1 });
  assert.deepEqual(rows[0], [
    'Nome completo', 'WhatsApp', 'E-mail', 'Serviço desejado', 'Ramo de negócio',
    'Descrição da necessidade', 'Link do Instagram', 'Nome do responsável pelo negócio',
    'Contato do responsável',
  ]);
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
