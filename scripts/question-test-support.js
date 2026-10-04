// Tests use a temporary PostgreSQL schema and never touch application records.
const crypto = require("crypto");
const {Pool} = require("pg");
const pool = require("../db");
async function createTestEnvironment() {
  if (process.env.DATABASE_URL || !["localhost", "127.0.0.1", "::1"].includes(pool.options.host)) {
    throw new Error("Os testes de questões exigem PostgreSQL local (PGHOST=localhost), sem DATABASE_URL.");
  }
  const schema = "sf_questions_test_" + crypto.randomBytes(6).toString("hex");
  await pool.query('CREATE SCHEMA "' + schema + '"');
  const isolated = new Pool({...pool.options, options: "-c search_path=" + schema});
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  pool.query = isolated.query.bind(isolated);
  pool.connect = isolated.connect.bind(isolated);
  let server;
  async function close() {
    if (server) await new Promise(resolve => server.close(resolve));
    pool.query = originalQuery; pool.connect = originalConnect;
    await isolated.end();
    await pool.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    await pool.end();
  }
  try {
    await pool.ensureSchema();
    const {rows} = await pool.query(`INSERT INTO users (name,email,password_hash,plan)
      VALUES ('Question Test','questions-test@example.test','not-a-login-hash','plus'),
             ('Other Test','other-test@example.test','not-a-login-hash','plus'),
             ('Free Test','free-test@example.test','not-a-login-hash','free') RETURNING id`);
    const app = require("../server");
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = "http://127.0.0.1:" + server.address().port;
    function token(id) {
      const payload = Buffer.from(JSON.stringify({id, exp: Date.now() + 3600000})).toString("base64url");
      return payload + "." + crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
    }
    async function request(path, body, id = rows[0].id) {
      const response = await fetch(base + "/api/questions" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {...(id ? {Cookie: "sf_session=" + token(id)} : {}), "Content-Type":"application/json"},
        ...(body === undefined ? {} : {body: JSON.stringify(body)})
      });
      return {status: response.status, data: await response.json()};
    }
    return {pool, base, userId: rows[0].id, otherId: rows[1].id, freeId: rows[2].id, token, request, close};
  } catch (e) { await close(); throw e; }
}
module.exports = {createTestEnvironment};
