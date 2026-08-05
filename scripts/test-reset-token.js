// Autoteste do token de recuperação de senha: node scripts/test-reset-token.js
// Não toca no banco — só exercita a assinatura HMAC do token.
const assert = require("assert");
const { createResetToken, parseResetToken, resetSignatureMatches } = require("../server.js").resetTokenInternals;

const HASH = "$2b$10$abcdefghijklmnopqrstuv";
const OTHER_HASH = "$2b$10$vutsrqponmlkjihgfedcba";

// Token válido: identifica o usuário e confere contra o hash atual.
const token = createResetToken(42, HASH);
const parsed = parseResetToken(token);
assert.strictEqual(parsed.id, 42);
assert.ok(resetSignatureMatches(parsed, HASH));

// Uso único: depois de trocar a senha, o hash muda e o link morre.
assert.ok(!resetSignatureMatches(parsed, OTHER_HASH));

// Assinatura adulterada é rejeitada.
const forged = parseResetToken(`${parsed.payload}.${"A".repeat(parsed.signature.length)}`);
assert.ok(!resetSignatureMatches(forged, HASH));

// Payload adulterado (trocar o id para roubar outra conta) invalida a assinatura.
const stolenPayload = Buffer.from(JSON.stringify({ id: 1, exp: Date.now() + 60000 })).toString("base64url");
assert.ok(!resetSignatureMatches(parseResetToken(`${stolenPayload}.${parsed.signature}`), HASH));

// Tokens malformados ou expirados não passam do parse.
assert.strictEqual(parseResetToken(""), null);
assert.strictEqual(parseResetToken("sem-ponto"), null);
assert.strictEqual(parseResetToken(`${Buffer.from(JSON.stringify({ id: 1, exp: Date.now() - 1 })).toString("base64url")}.x`), null);

console.log("ok: token de recuperação de senha");
process.exit(0);
