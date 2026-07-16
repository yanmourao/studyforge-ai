require("dotenv").config();
const { Client } = require("pg");

const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;

async function ensureDatabaseExists() {
  const adminClient = new Client({
    host: PGHOST,
    port: Number(PGPORT),
    user: PGUSER,
    password: PGPASSWORD,
    database: "postgres"
  });
  await adminClient.connect();
  const { rows } = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [PGDATABASE]);
  if (rows.length === 0) {
    await adminClient.query(`CREATE DATABASE "${PGDATABASE}"`);
    console.log(`Banco "${PGDATABASE}" criado.`);
  }
  await adminClient.end();
}

async function resetUsersTable() {
  const client = new Client({
    host: PGHOST,
    port: Number(PGPORT),
    user: PGUSER,
    password: PGPASSWORD,
    database: PGDATABASE
  });
  await client.connect();
  await client.query("DROP TABLE IF EXISTS users");
  await client.query(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.end();
  console.log('Tabela "users" recriada com sucesso.');
}

ensureDatabaseExists()
  .then(resetUsersTable)
  .catch((error) => {
    console.error("Falha ao configurar o banco de dados:", error.message);
    process.exit(1);
  });
