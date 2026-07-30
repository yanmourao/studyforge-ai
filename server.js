require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const Stripe = require("stripe");
const pool = require("./db");

const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_COOKIE = "sf_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const IS_PROD = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 3001;

// Sem SESSION_SECRET não é possível assinar cookies com segurança: aborta o
// boot em vez de rodar com sessões forjáveis.
if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  const message = "SESSION_SECRET ausente ou curto demais. Defina uma string aleatória longa no .env.";
  console.error(message);
  // Rodando direto (Render/dev) aborta o processo; como função serverless
  // process.exit() derruba o lambda sem log, então lança para aparecer no deploy.
  if (require.main === module) process.exit(1);
  throw new Error(message);
}

// Lista branca de origens permitidas para CORS. Aceita várias origens
// separadas por vírgula em ALLOWED_ORIGINS; nunca usamos "*" com credenciais.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://yanmourao.github.io";
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || ALLOWED_ORIGIN)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
if (!IS_PROD) ALLOWED_ORIGINS.add(`http://localhost:${PORT}`);

// Na Vercel a URL pública muda a cada deploy: FRONTEND_URL (ou VERCEL_URL,
// preenchida automaticamente) tem prioridade sobre a origem fixa do allowlist.
const VERCEL_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
const FRONTEND_URL = process.env.FRONTEND_URL || (IS_PROD ? VERCEL_URL || ALLOWED_ORIGIN : `http://localhost:${PORT}`);
if (VERCEL_URL) ALLOWED_ORIGINS.add(VERCEL_URL);
if (process.env.FRONTEND_URL) ALLOWED_ORIGINS.add(process.env.FRONTEND_URL);
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET;

// Hash bcrypt fixo de um valor arbitrário. Usado para gastar o mesmo tempo de
// verificação quando o e-mail não existe, evitando enumeração por timing.
const DUMMY_PASSWORD_HASH = "$2b$10$UnO9bQFYZtCe7zbp82yzT.g9sPGzgiqTiHBB3gUv10Bdj/jH2fUFG";

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

// --- Rate limiting (em memória, sem dependências) ---------------------------
// Suficiente para uma instância única (Render free). Para múltiplas réplicas,
// troque o Map por um store compartilhado (ex: Redis / express-rate-limit).
function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map();
  // Limpeza periódica das janelas expiradas para não vazar memória.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  if (typeof sweep.unref === "function") sweep.unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, message: "Muitas tentativas. Tente novamente em alguns minutos." });
const signupLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 8, message: "Muitos cadastros a partir deste dispositivo. Tente mais tarde." });
const checkoutLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 20, message: "Muitas tentativas de pagamento. Aguarde um instante." });

// --- Proteção anti-robô (Cloudflare Turnstile) ------------------------------
// No-op se TURNSTILE_SECRET não estiver configurado, para não travar o dev.
// No front, adicione o widget e envie o token no corpo como `turnstileToken`.
async function verifyTurnstile(req, res, next) {
  if (!TURNSTILE_SECRET) return next();
  const token = req.body && req.body.turnstileToken;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Verificação de segurança ausente." });
  }
  try {
    const params = new URLSearchParams();
    params.append("secret", TURNSTILE_SECRET);
    params.append("response", token);
    if (req.ip) params.append("remoteip", req.ip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: params });
    const data = await response.json();
    if (!data.success) return res.status(403).json({ error: "Verificação de segurança falhou." });
    next();
  } catch (error) {
    console.error("Erro ao validar Turnstile:", error.message);
    res.status(503).json({ error: "Não foi possível validar a verificação de segurança." });
  }
}

// --- Validação de entrada ----------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const isNonEmptyString = (value, max) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
const isValidEmail = (value) => typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value);
const isPositiveInt = (value) => Number.isInteger(value) && value > 0;

const ALLOWED_OBJECTIVES = new Set(["ENEM", "SAT", "Vestibular", "Concurso", "Faculdade", "Outro"]);
const ALLOWED_LEVELS = new Set(["Iniciante", "Intermediário", "Avançado"]);

// Converte uma linha da tabela users no formato de perfil usado pelo front.
function mapProfile(row) {
  return {
    objective: row.objective || null,
    days: row.exam_days || null,
    hours: row.daily_hours || null,
    studyTimeStart: row.study_time_start || null,
    studyTimeEnd: row.study_time_end || null,
    level: row.level || null,
    subjects: Array.isArray(row.subjects) ? row.subjects : []
  };
}

const app = express();
if (IS_PROD) app.set("trust proxy", 1);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Preflight de origem não permitida é barrado (sem header ACAO o browser bloqueia).
  if (req.method === "OPTIONS") {
    return origin && !ALLOWED_ORIGINS.has(origin) ? res.sendStatus(403) : res.sendStatus(204);
  }
  next();
});

// Precisa do corpo bruto (não JSON) para validar a assinatura do Stripe,
// então essa rota é registrada antes do express.json() global.
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send("Stripe não configurado.");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("Assinatura de webhook inválida:", error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        await pool.query(
          "UPDATE users SET plan = 'plus', stripe_customer_id = $1, stripe_subscription_id = $2 WHERE id = $3",
          [session.customer, session.subscription, session.client_reference_id]
        );
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const isActive = subscription.status === "active" || subscription.status === "trialing";
        await pool.query(
          "UPDATE users SET plan = $1 WHERE stripe_subscription_id = $2",
          [isActive ? "plus" : "free", subscription.id]
        );
        break;
      }
    }
    res.json({ received: true });
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao processar webhook.");
  }
});

app.use(express.json({ limit: "16kb" }));
// Arquivos do front vivem em public/ (servidos pelo Next na Vercel; aqui é o
// caminho usado quando o Express roda sozinho, ex: Render / dev sem Next).
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.post("/api/signup", signupLimiter, verifyTurnstile, async (req, res) => {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (!isNonEmptyString(name, 255)) {
    return res.status(400).json({ error: "Informe um nome válido (até 255 caracteres)." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Informe um e-mail válido." });
  }
  if (typeof password !== "string" || password.length < 6 || password.length > 200) {
    return res.status(400).json({ error: "A senha deve ter entre 6 e 200 caracteres." });
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

app.post("/api/login", loginLimiter, verifyTurnstile, async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (!isValidEmail(email) || typeof password !== "string" || !password || password.length > 200) {
    // Mensagem genérica também aqui, para não revelar qual campo falhou.
    return res.status(401).json({ error: "E-mail ou senha inválidos." });
  }

  try {
    const result = await pool.query(
      `SELECT id, name, email, password_hash, plan, objective, exam_days, daily_hours,
              study_time_start, study_time_end, level, subjects
       FROM users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];
    // Sempre executa um bcrypt.compare (contra um hash fixo quando o usuário não
    // existe) para que o tempo de resposta não revele se o e-mail está cadastrado.
    const passwordMatches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_PASSWORD_HASH);

    if (!user || !passwordMatches) {
      return res.status(401).json({ error: "E-mail ou senha inválidos." });
    }

    setSessionCookie(res, user.id);
    res.json({ id: user.id, name: user.name, email: user.email, plan: user.plan, profile: mapProfile(user) });
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
    const result = await pool.query(
      `SELECT id, name, email, plan, objective, exam_days, daily_hours,
              study_time_start, study_time_end, level, subjects
       FROM users WHERE id = $1`,
      [userId]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Não autenticado." });
    }
    res.json({ id: user.id, name: user.name, email: user.email, plan: user.plan, profile: mapProfile(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao verificar sessão." });
  }
});

app.post("/api/logout", (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

app.post("/api/billing/checkout", checkoutLimiter, async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Não autenticado." });
  }
  if (!stripe || !STRIPE_PRICE_ID) {
    return res.status(503).json({ error: "Pagamentos ainda não configurados." });
  }

  try {
    const result = await pool.query("SELECT id, email, stripe_customer_id FROM users WHERE id = $1", [userId]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: user.stripe_customer_id || undefined,
      customer_email: user.stripe_customer_id ? undefined : user.email,
      client_reference_id: String(user.id),
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
      success_url: `${FRONTEND_URL}/?checkout=success`,
      cancel_url: `${FRONTEND_URL}/?checkout=cancelled`
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao iniciar o pagamento." });
  }
});

app.post("/api/profile", async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  const body = req.body || {};
  const objective = ALLOWED_OBJECTIVES.has(body.objective) ? body.objective : null;
  const days = Number(body.days);
  const hours = Number(body.hours);
  const level = ALLOWED_LEVELS.has(body.level) ? body.level : null;
  const start = TIME_RE.test(body.studyTimeStart) ? body.studyTimeStart : null;
  const end = TIME_RE.test(body.studyTimeEnd) ? body.studyTimeEnd : null;
  const subjects = Array.isArray(body.subjects)
    ? body.subjects.filter((item) => typeof item === "string" && item.trim() && item.length <= 100).slice(0, 20)
    : [];

  if (!objective) {
    return res.status(400).json({ error: "Objetivo inválido." });
  }
  if (!Number.isInteger(days) || days < 1 || days > 999) {
    return res.status(400).json({ error: "Prazo deve estar entre 1 e 999 dias." });
  }
  if (body.hours !== undefined && (!Number.isInteger(hours) || hours < 1 || hours > 24)) {
    return res.status(400).json({ error: "Horas por dia inválidas." });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET objective = $1, exam_days = $2, daily_hours = $3,
              study_time_start = $4, study_time_end = $5, level = $6, subjects = $7::jsonb
       WHERE id = $8
       RETURNING objective, exam_days, daily_hours, study_time_start, study_time_end, level, subjects`,
      [objective, days, Number.isInteger(hours) ? hours : null, start, end, level, JSON.stringify(subjects), userId]
    );
    res.json({ profile: mapProfile(result.rows[0]) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao salvar seu perfil." });
  }
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
      `SELECT subject, COUNT(*) AS total, COUNT(*) FILTER (WHERE completed) AS completed,
              COALESCE(SUM(duration_minutes) FILTER (WHERE completed), 0) AS minutes
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
  const completed = Boolean(req.body.completed);

  if (!isNonEmptyString(subject, 100)) {
    return res.status(400).json({ error: "Informe a matéria da sessão (até 100 caracteres)." });
  }
  if (detail.length > 255) {
    return res.status(400).json({ error: "Descrição muito longa." });
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return res.status(400).json({ error: "Horário inválido." });
  }
  if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
    return res.status(400).json({ error: "Duração deve estar entre 1 e 600 minutos." });
  }
  if (tag.length > 30) {
    return res.status(400).json({ error: "Etiqueta inválida." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO study_sessions (user_id, subject, detail, session_time, duration_minutes, tag, completed)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, subject, detail, session_time, duration_minutes, tag, completed`,
      [userId, subject, detail, time, duration, tag, completed]
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
  if (!isPositiveInt(sessionId)) {
    return res.status(400).json({ error: "Identificador de sessão inválido." });
  }
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

app.get("/api/syllabus", async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  try {
    const result = await pool.query(
      "SELECT subject, topic, status FROM syllabus_progress WHERE user_id = $1",
      [userId]
    );
    res.json({ progress: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao carregar sua ementa." });
  }
});

app.post("/api/syllabus", async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (items.length > 200) {
    return res.status(400).json({ error: "Muitos itens em uma única requisição." });
  }
  const allowed = new Set(["unknown", "learning", "mastered"]);
  const valid = items
    .map((item) => ({
      subject: String(item && item.subject || "").trim(),
      topic: String(item && item.topic || "").trim(),
      status: String(item && item.status || "unknown").trim()
    }))
    .filter((item) =>
      item.subject && item.subject.length <= 100 &&
      item.topic && item.topic.length <= 255 &&
      allowed.has(item.status)
    );

  if (!valid.length) {
    return res.status(400).json({ error: "Nenhum item válido para salvar." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of valid) {
      await client.query(
        `INSERT INTO syllabus_progress (user_id, subject, topic, status, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id, subject, topic)
         DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
        [userId, item.subject, item.topic, item.status]
      );
    }
    await client.query("COMMIT");
    res.json({ saved: valid.length });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Erro ao salvar sua ementa." });
  } finally {
    client.release();
  }
});

// Corpo JSON inválido ou grande demais: responde em JSON, sem vazar stack.
app.use((error, req, res, next) => {
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Requisição muito grande." });
  }
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Corpo da requisição inválido." });
  }
  console.error(error);
  res.status(500).json({ error: "Erro interno." });
});

module.exports = app;

// Só sobe o servidor quando executado direto (`node server.js`, Render/dev).
// Na Vercel o mesmo app é chamado por pages/api/[...path].js como função.
if (require.main === module) {
  pool
    .ensureSchema()
    .then(() => {
      app.listen(PORT, () => console.log(`StudyForge AI rodando em http://localhost:${PORT}`));
    })
    .catch((error) => {
      console.error("Falha ao preparar o banco de dados:", error.message);
      process.exit(1);
    });
}
