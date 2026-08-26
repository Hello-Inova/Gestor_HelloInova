// Ponto de entrada usado pela Vercel: ela procura por um arquivo chamado
// app/index/server na raiz do projeto (ou em src/) para publicar a
// aplicação Express como uma única função serverless. O código do servidor
// em si mora em server/index.js, usado localmente via "npm start"/"npm run dev".
module.exports = require('./server/index.js');
