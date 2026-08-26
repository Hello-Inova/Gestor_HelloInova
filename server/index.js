require('dotenv').config(); // carrega .env (segredos: JWT_SECRET, RESEND_API_KEY, etc.)

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');

require('./db'); // garante criação do schema na inicialização

const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const systemRoutes = require('./routes/systems');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// Limite maior para caber o anexo de contrato (base64) além da logo do sistema.
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/systems', systemRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Frontend estático
const CLIENT_DIR = path.join(__dirname, '..', 'client', 'public');
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
  // Erros de I/O do SQLite (ex: "disk I/O error", "database is locked") costumam
  // acontecer quando a pasta do projeto está sincronizada por OneDrive/Google
  // Drive/Dropbox e o serviço de sincronização trava o arquivo do banco por um
  // instante. Avisamos isso explicitamente para não parecer que a edição
  // "sumiu" sem explicação.
  if (err && (err.code === 'ERR_SQLITE_ERROR' || /disk i\/o|database is locked|SQLITE_BUSY|SQLITE_IOERR/i.test(err.message || ''))) {
    return res.status(503).json({
      error: 'Não foi possível gravar no banco de dados agora (a pasta pode estar sendo sincronizada por OneDrive/Google Drive/Dropbox). Tente salvar novamente em alguns segundos.',
    });
  }
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`HelloInova Manager rodando em http://localhost:${PORT}`);
});
