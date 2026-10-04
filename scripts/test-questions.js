const assert = require("node:assert/strict");
const {questions, subjects} = require("../question-bank");
const {summarize} = require("../question-api");
const {createTestEnvironment} = require("./question-test-support");
(async () => {
  assert.equal(questions.length, 60);
  assert.equal(new Set(questions.map(q => q.id)).size, 60);
  for (const s of subjects) assert.equal(questions.filter(q => q.subject === s).length, 10);
  for (const q of questions) {
    assert.equal(q.options.length, 4);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
    assert.ok(q.prompt && q.explanation);
  }
  const empty = summarize({id: 9, started_at: new Date(0), ended_at: new Date(60000)}, []);
  assert.equal(empty.percentage, 0); assert.equal(empty.seconds, 60);
  const env = await createTestEnvironment();
  try {
    const {request} = env;
    assert.equal((await request("", undefined, null)).status, 401);
    assert.equal((await request("", undefined, env.freeId)).status, 402);
    const catalog = await request("");
    assert.equal(catalog.status, 200);
    assert.equal(catalog.data.questions.length, 60);
    assert.ok(catalog.data.questions.every(q => !("answer" in q) && !("explanation" in q)));
    let result = await request("/answer", {questionId:"1-1", selected:2, seconds:10, sessionId:null});
    assert.equal(result.data.correct, true);
    assert.equal((await request("/sessions")).data.history.length, 0);
    const [startA,startB] = await Promise.all([request("/sessions", {}), request("/sessions", {})]);
    const id = startA.data.active.id;
    assert.equal(startB.data.active.id, id);
    await env.pool.query("UPDATE question_sessions SET started_at = NOW() - INTERVAL '120 seconds' WHERE id = $1", [id]);
    assert.equal((await request("/answer", {questionId:"unknown", selected:0, seconds:0})).status, 400);
    assert.equal((await request("/answer", {questionId:"1-1", selected:9, seconds:0})).status, 400);
    assert.equal((await request("/answer", {questionId:"1-1", selected:2, seconds:-1})).status, 400);
    assert.equal((await request("/answer", {questionId:"1-1", selected:2, seconds:1, sessionId:id}, env.otherId)).status, 404);
    const answer = {questionId:"1-1", selected:2, seconds:30, sessionId:id};
    const duplicates = await Promise.all([request("/answer", answer), request("/answer", {...answer, selected:0})]);
    assert.equal(duplicates[0].data.selected, duplicates[1].data.selected);
    // Choose the second question based on the first outcome so the summary has one correct and one wrong.
    const firstCorrect = duplicates[0].data.correct;
    result = await request("/answer", {questionId:"3-1", selected:firstCorrect ? 0 : 2, seconds:40, sessionId:id, correct:true});
    assert.equal(result.data.correct, !firstCorrect);
    const resumed = await request("/sessions");
    assert.equal(resumed.data.active.total, 2);
    assert.equal(resumed.data.active.correct, 1);
    assert.equal(resumed.data.active.percentage, 50);
    assert.equal(resumed.data.active.subjects.length, 2);
    assert.equal((await request("/sessions/" + id + "/finish", {}, env.otherId)).status, 404);
    const finished = await request("/sessions/" + id + "/finish", {});
    assert.equal(finished.status, 200);
    assert.equal(finished.data.active, null);
    assert.equal(finished.data.summary.correct, 1);
    assert.equal(finished.data.summary.total, 2);
    assert.equal(finished.data.summary.percentage, 50);
    assert.ok(finished.data.summary.seconds >= 120);
    assert.equal(finished.data.summary.subjects.reduce((n,s) => n+s.seconds, 0), 70);
    const again = await request("/sessions/" + id + "/finish", {});
    assert.equal(again.data.summary.endedAt, finished.data.summary.endedAt);
    assert.equal((await request("/answer", {...answer, questionId:"1-2"})).status, 409);
    assert.equal((await request("/sessions", undefined, env.otherId)).data.history.length, 0);
    const newSession = await request("/sessions", {});
    assert.notEqual(newSession.data.active.id, id);
    const blank = await request("/sessions/" + newSession.data.active.id + "/finish", {});
    assert.equal(blank.data.summary.total, 0);
    assert.equal(blank.data.summary.percentage, 0);
    assert.equal(blank.data.history.length, 2);
    console.log("OK: 60 questões, autenticação, assinatura, avulsa, retomada, concorrência, correção, resumo, isolamento e encerramento.");
  } finally { await env.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
