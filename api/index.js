// Ponto de entrada explícito usado pela Vercel (ver vercel.json na raiz).
// Colocar a função serverless dentro de /api, com um vercel.json explícito,
// evita a detecção automática de "framework Express" da Vercel — que nos
// nossos testes empacotou o app de forma incorreta (routers virando objetos
// simples ao invés de funções, causando o erro
// "Router.use() requires a middleware function but got a Object").
// Aqui controlamos exatamente qual arquivo vira a função e como as rotas
// são despachadas até ela (via "rewrites" no vercel.json).
module.exports = require('../server/index.js');
