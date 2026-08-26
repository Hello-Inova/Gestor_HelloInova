require('dotenv').config(); // carrega .env (segredos: JWT_SECRET, RESEND_API_KEY, DATABASE_URL etc.)

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');

const db = require('./db');

const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const systemRoutes = require('./routes/systems');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// Limite maior para caber o anexo de contrato (base64) além da logo do sistema.
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());

// Garante que o schema do Postgres já exista antes de qualquer rota rodar
// uma query. Numa função serverless (Vercel) isso roda de verdade só no
// primeiro "cold start" de cada instância — chamadas seguintes reaproveitam
// a mesma promise resolvida (ver server/db.js).
app.use((req, res, next) => {
  db.ready().then(() => next(), next);
});

app.use('/api/auth', authRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/systems', systemRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Frontend estático — precisa estar em public/** na raiz do projeto (a
// Vercel serve esse diretório direto pela CDN e ignora express.static() nas
// funções serverless; localmente o express.static abaixo cobre o mesmo
// diretório).
const CLIENT_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(CLIENT_DIR));

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
