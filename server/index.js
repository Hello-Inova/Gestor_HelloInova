const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');

require('./db'); // garante criação do schema na inicialização

const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const systemRoutes = require('./routes/systems');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '3mb' })); // permite anexar a logo do sistema (base64) no Gestor de Sistemas
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/systems', systemRoutes);

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
    return res.status(413).json({ error: 'Arquivo muito grande. Envie uma imagem menor (até ~1MB).' });
  }
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`HelloInova Manager rodando em http://localhost:${PORT}`);
});
