require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("./db");

const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_COOKIE = "sf_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const IS_PROD = process.env.NODE_ENV === "production";
// Origem do front-end hospedado (GitHub Pages). Em dev local, qualquer
// origem sem header (mesma origem) já funciona sem CORS.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://yanmourao.github.io";

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function createSessionToken(userId) {
  const payload = Buffer.from(JSON.stringify({ id: userId, exp: Date.now() + SESSION_MAX_AGE_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.id || !data.exp || data.exp < Date.now()) return null;
    return data.id;
  } catch (error) {
    return null;
  }
}

function getAuthenticatedUserId(req) {
  return verifySessionToken(parseCookies(req)[SESSION_COOKIE]);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(";").forEach((pair) => {
    const index = pair.indexOf("=");
    if (index === -1) return;
    cookies[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
  });
  return cookies;
}

function setSessionCookie(res, userId) {
  const token = createSessionToken(userId);
  const maxAgeSeconds = Math.floor(SESSION_MAX_AGE_MS / 1000);
  // Cross-site (GitHub Pages -> Render) exige SameSite=None + Secure (HTTPS).
  // Em dev local (http, mesma origem) usamos SameSite=Lax sem Secure.
  const attrs = IS_PROD
    ? `HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=None; Secure`
    : `HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; ${attrs}`);
}

function clearSessionCookie(res) {
  const attrs = IS_PROD
    ? "HttpOnly; Path=/; Max-Age=0; SameSite=None; Secure"
    : "HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; ${attrs}`);
}

const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/app.js", (req, res) => res.sendFile(path.join(__dirname, "app.js")));
app.get("/styles.css", (req, res) => res.sendFile(path.join(__dirname, "styles.css")));

app.post("/api/signup", async (req, res) => {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios." });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at",
      [name, email, passwordHash]
    );
    setSessionCookie(res, result.rows[0].id);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Este e-mail já está cadastrado." });
    }
    console.error(error);
    res.status(500).json({ error: "Erro ao salvar cadastro." });
  }
});

app.post("/api/login", async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (!email || !password) {
    return res.status(400).json({ error: "Informe e-mail e senha." });
  }

  try {
    const result = await pool.query(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    const passwordMatches = user && (await bcrypt.compare(password, user.password_hash));

    if (!passwordMatches) {
      return res.status(401).json({ error: "E-mail ou senha inválidos." });
    }

    setSessionCookie(res, user.id);
    res.json({ id: user.id, name: user.name, email: user.email });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao entrar na conta." });
  }
});

app.get("/api/me", async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  try {
    const result = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [userId]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Não autenticado." });
    }
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao verificar sessão." });
  }
});

app.post("/api/logout", (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

app.get("/api/dashboard", async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  try {
    const today = await pool.query(
      `SELECT id, subject, detail, session_time, duration_minutes, tag, completed
       FROM study_sessions
       WHERE user_id = $1 AND session_date = CURRENT_DATE
       ORDER BY session_time ASC`,
      [userId]
    );

    const daily = await pool.query(
      `SELECT session_date::text AS date,
              COALESCE(SUM(duration_minutes) FILTER (WHERE completed), 0) AS minutes,
              BOOL_OR(completed) AS has_completed
       FROM study_sessions
       WHERE user_id = $1 AND session_date >= CURRENT_DATE - INTERVAL '29 days'
       GROUP BY session_date`,
      [userId]
    );

    const subjects = await pool.query(
      `SELECT subject, COUNT(*) AS total, COUNT(*) FILTER (WHERE completed) AS completed
       FROM study_sessions
       WHERE user_id = $1
       GROUP BY subject
       ORDER BY total DESC`,
      [userId]
    );

    res.json({ today: today.rows, daily: daily.rows, subjects: subjects.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao carregar dados do dashboard." });
  }
});

app.post("/api/sessions", async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  const subject = (req.body.subject || "").trim();
  const detail = (req.body.detail || "").trim();
  const time = (req.body.time || "08:00").trim();
  const duration = Number(req.body.duration) || 30;
  const tag = (req.body.tag || "Prática").trim();

  if (!subject) {
    return res.status(400).json({ error: "Informe a matéria da sessão." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO study_sessions (user_id, subject, detail, session_time, duration_minutes, tag)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, subject, detail, session_time, duration_minutes, tag, completed`,
      [userId, subject, detail, time, duration, tag]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao criar sessão de estudo." });
  }
});

app.post("/api/sessions/:id/toggle", async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  const sessionId = Number(req.params.id);
  try {
    const result = await pool.query(
      `UPDATE study_sessions SET completed = NOT completed
       WHERE id = $1 AND user_id = $2
       RETURNING id, subject, detail, session_time, duration_minutes, tag, completed`,
      [sessionId, userId]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "Sessão não encontrada." });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar sessão." });
  }
});

const port = process.env.PORT || 3000;
pool
  .ensureSchema()
  .then(() => {
    app.listen(port, () => console.log(`StudyForge AI rodando em http://localhost:${port}`));
  })
  .catch((error) => {
    console.error("Falha ao preparar o banco de dados:", error.message);
    process.exit(1);
  });
