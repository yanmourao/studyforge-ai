// Todas as rotas /api/* na Vercel são atendidas por esta função, que apenas
// entrega req/res ao app Express existente (mesmo código que roda no Render).
const app = require("../../server");
const pool = require("../../db");

// ponytail: migração roda uma vez por instância fria; se virar gargalo,
// mover ensureSchema() para um passo de build/deploy.
let schemaReady;

async function handler(req, res) {
  schemaReady = schemaReady || pool.ensureSchema();
  await schemaReady;
  return app(req, res);
}

module.exports = handler;
module.exports.default = handler;
// O Express faz o próprio parsing (inclusive o corpo bruto do webhook Stripe).
module.exports.config = { api: { bodyParser: false } };
