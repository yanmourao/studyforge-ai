// Copia os dados de um Postgres para outro. Uso:
//   node scripts/migrate-db.js "<url-origem>" "<url-destino>"
// O schema do destino é criado por ensureSchema(); aqui só copiamos linhas.
const { Pool, types } = require("pg");

// Sem isso o driver lê um JSONB de array como array JS e o reinsere como
// literal de array do Postgres ({a,b}), que não é JSON válido. Ler como
// texto puro faz a coluna voltar exatamente como saiu.
types.setTypeParser(114, (v) => v); // json
types.setTypeParser(3802, (v) => v); // jsonb

const TABLES = ["users", "study_sessions", "syllabus_progress"];

async function main() {
  const [fromUrl, toUrl] = process.argv.slice(2);
  if (!fromUrl || !toUrl) {
    console.error('Uso: node scripts/migrate-db.js "<url-origem>" "<url-destino>"');
    process.exit(1);
  }

  const ssl = { rejectUnauthorized: false };
  const from = new Pool({ connectionString: fromUrl, ssl });
  const to = new Pool({ connectionString: toUrl, ssl });

  // Cria o schema no destino reusando a migração do app.
  process.env.DATABASE_URL = toUrl;
  await require("../db").ensureSchema();

  const client = await to.connect();
  try {
    await client.query("BEGIN");
    for (const table of TABLES) {
      const { rows } = await from.query(`SELECT * FROM ${table} ORDER BY id`);
      if (!rows.length) {
        console.log(`${table}: vazia`);
        continue;
      }
      const cols = Object.keys(rows[0]);
      const colList = cols.map((c) => `"${c}"`).join(", ");
      for (const row of rows) {
        const params = cols.map((c) => row[c]);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        await client.query(
          `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
          params
        );
      }
      // Sem isso o próximo INSERT do app colide com os ids copiados.
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT MAX(id) FROM ${table}))`
      );
      console.log(`${table}: ${rows.length} linhas`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await Promise.all([from.end(), to.end()]);
  console.log("Migração concluída.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
