require('dotenv').config(); // carrega .env (segredos: JWT_SECRET, RESEND_API_KEY, DATABASE_URL etc.)

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');

const db = require('./db');
const { applySecurityHeaders, protectUnsafeRequests } = require('./security');

const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const systemRoutes = require('./routes/systems');
const dashboardRoutes = require('./routes/dashboard');
const leadRoutes = require('./routes/leads');
const candidateRoutes = require('./routes/candidates');
const publicSiteRoutes = require('./routes/public-sites');

const app = express();
const PORT = process.env.PORT || 3000;

// A Vercel (e outros hosts serverless) ficam atrás de um proxy reverso que
// termina o HTTPS e repassa o protocolo original no header
// "X-Forwarded-Proto". Sem isso, req.protocol sempre voltaria "http",
// gerando links errados (ex: no e-mail de recuperação de senha).
app.set('trust proxy', 1);

// Limite maior para caber vários anexos em base64 (logo, contrato e os PDFs
// da documentação sistêmica) numa mesma requisição.
app.use(cookieParser());
app.use(applySecurityHeaders);
app.use(protectUnsafeRequests);

// Garante que o schema do Postgres já exista antes de qualquer rota rodar
// uma query. Numa função serverless (Vercel) isso roda de verdade só no
// primeiro "cold start" de cada instância — chamadas seguintes reaproveitam
// a mesma promise resolvida (ver server/db.js).
app.use((req, res, next) => {
  db.ready().then(() => next(), next);
});

app.use('/api/auth', express.json({ limit: '64kb' }), authRoutes);
app.use('/api/pages', express.json({ limit: '256kb' }), pageRoutes);
app.use('/api/systems', express.json({ limit: '30mb' }), systemRoutes);
app.use('/api/dashboard', express.json({ limit: '64kb' }), dashboardRoutes);
app.use('/api/leads', express.json({ limit: '64kb' }), leadRoutes);
app.use('/api/candidates', express.json({ limit: '64kb' }), candidateRoutes);
app.use('/api/public-sites', express.json({ limit: '64kb' }), publicSiteRoutes);

// Frontend estático — precisa estar em public/** na raiz do projeto (a
// Vercel serve esse diretório direto pela CDN e ignora express.static() nas
// funções serverless; localmente o express.static abaixo cobre o mesmo
// diretório).
const CLIENT_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(CLIENT_DIR));

// URL amigável (sem ".html") para o formulário público de captação de leads,
// pensada para ser usada em bio do Instagram/links externos.
app.get('/captacao', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'captacao.html'));
});

app.get('/sites-publicos/:slug([a-f0-9]{32})', (req, res) => {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  res.sendFile(path.join(CLIENT_DIR, 'public-sites.html'));
});

app.get(['/sites-publicos', '/sites-publicos/*'], (req, res) => {
  res.status(404).type('text/plain').send('Página pública não encontrada.');
});

// Qualquer rota não-API cai no SPA (index.html cuida do roteamento client-side)
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

// Handler de erro genérico
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ error: 'Arquivo muito grande. Envie um arquivo menor.' });
  }
  // Erros de conexão com o Postgres (ex: DATABASE_URL errada, banco fora do
  // ar) costumam aparecer assim — avisamos isso explicitamente em vez de um
  // "erro interno" genérico, já que normalmente é um problema de configuração.
  if (err && (err.code === 'ECONNREFUSED' || err.code === '28P01' || err.code === '3D000' || /database.*does not exist|password authentication failed/i.test(err.message || ''))) {
    return res.status(503).json({
      error: 'Não foi possível conectar ao banco de dados agora. Verifique a variável DATABASE_URL.',
    });
  }
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// Só sobe um servidor HTTP tradicional quando este arquivo é executado
// diretamente (ex: "npm start"/"npm run dev" local). Na Vercel o app é
// importado como módulo e servido por uma função serverless — não deve
// tentar escutar uma porta.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`HelloInova Manager rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
