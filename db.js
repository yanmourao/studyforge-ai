require("dotenv").config();
const { Pool } = require("pg");

// Em produção (Render) a variável DATABASE_URL já vem pronta e exige SSL.
// Em desenvolvimento local usamos as variáveis PG* individuais do .env.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE
    });

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject VARCHAR(100) NOT NULL,
      detail VARCHAR(255) NOT NULL DEFAULT '',
      session_date DATE NOT NULL DEFAULT CURRENT_DATE,
      session_time VARCHAR(5) NOT NULL DEFAULT '08:00',
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      tag VARCHAR(30) NOT NULL DEFAULT 'Prática',
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS study_sessions_user_date_idx ON study_sessions (user_id, session_date)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS syllabus_progress (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject VARCHAR(100) NOT NULL,
      topic VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'unknown',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, subject, topic)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS syllabus_progress_user_idx ON syllabus_progress (user_id)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'free'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)`);
}

module.exports = pool;
module.exports.ensureSchema = ensureSchema;
