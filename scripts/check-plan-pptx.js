// Verificação do POST /api/plan/pptx. Não toca no banco: a rota só formata o
// plano que o front manda, então dá para checar sem Postgres.
// Rodar com: npm run check:pptx
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "check-only-secret-0123456789";

const assert = require("assert");
const crypto = require("crypto");
const path = require("path");
const os = require("os");
const fs = require("fs");
const JSZip = require("jszip");
const app = require("../server");

const payload = Buffer.from(JSON.stringify({ id: 1, exp: Date.now() + 60000 })).toString("base64url");
const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
const cookie = `sf_session=${payload}.${signature}`;

const body = {
  subtitle: "ENEM · 90 dias · 08:00 às 10:00 · nível intermediário",
  days: [
    { label: "Hoje", date: "30 de jul", rows: [["08:00", "Matemática", "Funções · conteúdo novo"], ["09:00", "Português", "Crase · revisão"]] },
    { label: "Amanhã", date: "31 de jul", rows: [["08:00", "Português", "Sintaxe · conteúdo novo"]] }
  ]
};

const server = app.listen(0, async () => {
  const url = `http://127.0.0.1:${server.address().port}/api/plan/pptx`;
  const post = (payloadBody, headers = {}) => fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payloadBody)
  });

  try {
    assert.strictEqual((await post(body)).status, 401, "sem sessão deve dar 401");
    assert.strictEqual((await post({ days: [] }, { cookie })).status, 400, "plano vazio deve dar 400");

    const response = await post(body, { cookie });
    assert.strictEqual(response.status, 200);
    assert.match(response.headers.get("content-type"), /presentationml\.presentation/);

    const buffer = Buffer.from(await response.arrayBuffer());
    assert.ok(buffer[0] === 0x50 && buffer[1] === 0x4b, "resposta deve ser um zip (.pptx)");

    // Capa + um slide por dia, com o texto do plano dentro.
    const zip = await JSZip.loadAsync(buffer);
    const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    assert.strictEqual(slides.length, body.days.length + 1, "esperado capa + um slide por dia");

    const texts = await Promise.all(slides.map(async (name) => {
      const xml = await zip.file(name).async("string");
      return [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((match) => match[1]).join(" ");
    }));
    const all = texts.join(" ");
    assert.ok(all.includes("Meu plano de estudos"), "capa faltando");
    assert.ok(all.includes("Funções · conteúdo novo"), "tópico do plano não chegou no slide");
    assert.ok(all.includes("Amanhã"), "dia do plano não chegou no slide");

    const out = path.join(os.tmpdir(), "studyforge-check.pptx");
    fs.writeFileSync(out, buffer);
    console.log(`OK — 401/400/200, ${slides.length} slides, ${buffer.length} bytes (${out})`);
    server.close();
  } catch (error) {
    console.error("FALHOU:", error.message);
    server.close();
    process.exitCode = 1;
  }
});
