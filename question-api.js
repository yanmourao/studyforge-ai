const express = require("express");
const { questions, subjects } = require("./question-bank");
const byId = new Map(questions.map(q => [q.id, q]));
const percentage = (correct, total) => total ? Math.round(correct / total * 100) : 0;

function summarize(session, attempts, now = Date.now()) {
  const rows = attempts.filter(a => a.session_id === session.id);
  const groups = new Map();
  for (const a of rows) {
    if (!groups.has(a.subject)) groups.set(a.subject, {subject: a.subject, total: 0, correct: 0, seconds: 0});
    const g = groups.get(a.subject);
    g.total++; g.correct += Number(a.correct); g.seconds += Number(a.duration_seconds);
  }
  const correct = rows.filter(a => a.correct).length;
  return {
    id: session.id, startedAt: session.started_at, endedAt: session.ended_at,
    seconds: Math.max(0, Math.floor(((session.ended_at ? new Date(session.ended_at).getTime() : now) - new Date(session.started_at).getTime()) / 1000)),
    total: rows.length, correct, percentage: percentage(correct, rows.length),
    subjects: [...groups.values()].map(g => ({...g, percentage: percentage(g.correct, g.total)})),
    answers: rows.map(a => ({questionId: a.question_id, selected: a.selected_option, correct: a.correct,
      answer: byId.get(a.question_id)?.answer, explanation: byId.get(a.question_id)?.explanation || ""}))
  };
}

function createQuestionRouter(pool, getUserId) {
  const router = express.Router();
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  async function readState(userId) {
    const { rows: sessions } = await pool.query(
      "SELECT * FROM question_sessions WHERE user_id = $1 ORDER BY started_at DESC, id DESC LIMIT 11", [userId]);
    const { rows: attempts } = await pool.query(
      "SELECT * FROM question_attempts WHERE user_id = $1 AND session_id = ANY($2::int[]) ORDER BY id", [userId, sessions.map(s => s.id)]);
    return {
      active: sessions.find(s => !s.ended_at) ? summarize(sessions.find(s => !s.ended_at), attempts) : null,
      history: sessions.filter(s => s.ended_at).slice(0, 10).map(s => summarize(s, attempts))
    };
  }
  router.get("/", (req, res) => res.json({
    subjects, questions: questions.map(({answer, explanation, ...q}) => q)
  }));
  router.get("/sessions", async (req, res, next) => {
    try { res.json(await readState(getUserId(req))); } catch (e) { next(e); }
  });
  router.post("/sessions", async (req, res, next) => {
    try {
      // A partial unique index makes starting from two tabs idempotent.
      await pool.query(`INSERT INTO question_sessions (user_id) VALUES ($1)
        ON CONFLICT (user_id) WHERE ended_at IS NULL DO NOTHING`, [getUserId(req)]);
      res.status(201).json(await readState(getUserId(req)));
    } catch (e) { next(e); }
  });
  router.post("/answer", async (req, res, next) => {
    const body = req.body || {};
    const q = byId.get(body.questionId);
    const selected = body.selected;
    const seconds = body.seconds;
    const sessionId = body.sessionId == null ? null : body.sessionId;
    if (!q || !Number.isInteger(selected) || selected < 0 || selected >= q.options.length ||
        !Number.isInteger(seconds) || seconds < 0 || seconds > 86400 ||
        (sessionId !== null && (!Number.isInteger(sessionId) || sessionId < 1))) {
      return res.status(400).json({error: "Resposta inválida."});
    }
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      if (sessionId !== null) {
        const {rows} = await client.query("SELECT * FROM question_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE", [sessionId, getUserId(req)]);
        if (!rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({error: "Sessão não encontrada."}); }
        if (rows[0].ended_at) { await client.query("ROLLBACK"); return res.status(409).json({error: "Esta sessão já foi encerrada."}); }
        const {rows: existing} = await client.query("SELECT * FROM question_attempts WHERE session_id = $1 AND question_id = $2", [sessionId, q.id]);
        if (existing[0]) {
          await client.query("COMMIT");
          return res.json({questionId: q.id, selected: existing[0].selected_option, correct: existing[0].correct, answer: q.answer, explanation: q.explanation});
        }
      }
      // Never accept a correctness flag from the browser.
      await client.query(`INSERT INTO question_attempts
        (user_id, session_id, question_id, subject, selected_option, correct, duration_seconds)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [getUserId(req), sessionId, q.id, q.subject, selected, selected === q.answer, seconds]);
      await client.query("COMMIT");
      res.json({questionId: q.id, selected, correct: selected === q.answer, answer: q.answer, explanation: q.explanation});
    } catch (e) {
      if (client) await client.query("ROLLBACK");
      next(e);
    } finally { if (client) client.release(); }
  });
  router.post("/sessions/:id/finish", async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({error: "Sessão inválida."});
    try {
      // Row locking in UPDATE serializes finishing with in-flight answers.
      const {rows} = await pool.query(`UPDATE question_sessions SET ended_at = COALESCE(ended_at, NOW())
        WHERE id = $1 AND user_id = $2 RETURNING *`, [id, getUserId(req)]);
      if (!rows[0]) return res.status(404).json({error: "Sessão não encontrada."});
      const {rows: attempts} = await pool.query("SELECT * FROM question_attempts WHERE session_id = $1 AND user_id = $2 ORDER BY id", [id, getUserId(req)]);
      res.json({summary: summarize(rows[0], attempts), ...await readState(getUserId(req))});
    } catch (e) { next(e); }
  });
  return router;
}
module.exports = {createQuestionRouter, summarize};
