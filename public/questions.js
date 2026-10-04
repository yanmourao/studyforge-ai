(() => {
  const root = document.getElementById("questions-root");
  const qState = {bank: [], subjects: [], active: null, history: [], report: null,
    subject: null, index: 0, selected: null, freeAnswers: new Map(), busy: false, loaded: false, loading: false, epoch: 0,
    userId: null, times: new Map(), timedKey: null, viewedMs: 0, viewedSince: null};
  const esc = escapeHtml;
  const letters = ["A", "B", "C", "D"];
  function clock(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return s >= 3600 ? `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, "0")}min`
      : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  function pauseQuestion() {
    if (qState.viewedSince !== null) qState.viewedMs += Date.now() - qState.viewedSince;
    qState.viewedSince = null;
    if (qState.timedKey) qState.times.set(qState.timedKey, qState.viewedMs);
  }
  function startQuestionClock() {
    if (qState.subject && state.currentView === "questions" && !document.hidden && !answerFor(currentQuestion()?.id)) {
      if (qState.viewedSince === null) qState.viewedSince = Date.now();
    }
  }
  function resetQuestionClock() {
    qState.timedKey = currentQuestion() ? (qState.active?.id || "free") + ":" + currentQuestion().id : null;
    qState.viewedMs = qState.times.get(qState.timedKey) || 0;
    qState.viewedSince = null; startQuestionClock();
  }
  function currentQuestion() { return qState.bank.filter(q => q.subject === qState.subject)[qState.index]; }
  function answerFor(id) {
    return qState.active ? qState.active.answers.find(a => a.questionId === id) : qState.freeAnswers.get(id);
  }
  function currentSessionSeconds() {
    return qState.active ? Math.max(0, Math.floor((Date.now() - new Date(qState.active.startedAt).getTime()) / 1000)) : 0;
  }
  async function api(path, body) {
    const epoch = qState.epoch;
    const response = await fetch(`${API_BASE}/api/questions${path}`, {
      method: body === undefined ? "GET" : "POST", credentials: "include",
      headers: body === undefined ? {} : {"Content-Type": "application/json"},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})
    });
    if (epoch !== qState.epoch) throw new Error("A conta foi alterada. Abra Questões novamente.");
    if (response.status === 402) showScreen("paywall-screen");
    if (response.status === 401) goToLogin();
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível carregar as questões.");
    return data;
  }
  function applySessions(data) {
    qState.active = data.active;
    qState.history = data.history;
    if (!qState.report && data.history.length) qState.report = data.history[0];
  }
  async function load() {
    if (qState.userId !== state.user.id) {
      window.dispatchEvent(new CustomEvent("studyforge:logout"));
      qState.userId = state.user.id;
    }
    if (qState.loading) return;
    qState.loading = true;
    if (!qState.loaded) root.innerHTML = '<div class="panel q-empty">Carregando questões e sessões…</div>';
    const epoch = qState.epoch;
    try {
      const [catalog, sessions] = await Promise.all([api(""), api("/sessions")]);
      if (epoch !== qState.epoch) return;
      qState.bank = catalog.questions; qState.subjects = catalog.subjects;
      applySessions(sessions); qState.loaded = true;
      resetQuestionClock(); render();
    } catch (error) {
      if (epoch === qState.epoch) root.innerHTML = `<div class="panel q-empty"><p>${esc(error.message)}</p><button class="button button-outline" data-q-action="reload">Tentar novamente</button></div>`;
    } finally { if (epoch === qState.epoch) qState.loading = false; }
  }
  function reportHtml(report, live = false) {
    if (!report) return "";
    const seconds = live ? currentSessionSeconds() : report.seconds;
    return `<section class="panel q-report" aria-label="Resumo da sessão">
      <div class="q-section-head"><div><span class="panel-kicker">${live ? "DESEMPENHO EM TEMPO REAL" : "RESUMO DA SESSÃO"}</span><h2>${live ? "Sessão em andamento" : "Resultado da sessão"}</h2></div><span class="q-mode">${live ? "Em andamento" : "Concluída"}</span></div>
      <div class="q-metrics">
        <div><span>Acertos / respondidas</span><strong>${report.correct}<small> / ${report.total}</small></strong></div>
        <div><span>Aproveitamento</span><strong>${report.percentage}<small>%</small></strong></div>
        <div><span>Tempo total</span><strong ${live ? 'id="q-report-clock"' : ""}>${clock(seconds)}</strong></div>
        <div><span>Matérias praticadas</span><strong>${report.subjects.length}</strong></div>
      </div>
      <p class="q-caption">${report.total ? "O aproveitamento considera apenas as questões respondidas." : "Nenhuma questão respondida ainda. Escolha uma matéria para começar."} O tempo total é corrido, do início ao encerramento da sessão.</p>
      ${report.subjects.length ? `<div class="q-table-wrap"><table class="q-table"><caption>Resultado por matéria</caption><thead><tr><th scope="col">Matéria</th><th scope="col">Acertos / total</th><th scope="col">Acerto</th><th scope="col">Tempo nas questões</th></tr></thead><tbody>${report.subjects.map(s => `<tr><th scope="row">${esc(s.subject)}</th><td>${s.correct} / ${s.total}</td><td><span class="q-percent">${s.percentage}%</span></td><td>${clock(s.seconds)}</td></tr>`).join("")}</tbody></table></div><p class="q-caption">O tempo por matéria soma o tempo de leitura e resposta nesta página; intervalos e navegação entram somente no tempo total.</p>` : ""}
    </section>`;
  }
  function render() {
    if (!qState.loaded) return;
    const active = qState.active;
    const disabled = qState.busy ? "disabled" : "";
    root.innerHTML = `
      <section class="panel q-session-bar">
        <div><span class="panel-kicker">${active ? "SESSÃO DE ESTUDO" : "PRÁTICA AVULSA"}</span><h2>${active ? 'Sessão em andamento <span class="q-live-dot"></span>' : "Escolha como quer estudar"}</h2><p>${active ? "Alterne entre matérias. Cada questão conta uma vez nesta sessão. O cronômetro segue até encerrar." : "Pratique livremente ou inicie uma sessão para reunir seus resultados em um resumo."}</p></div>
        <div class="q-session-actions">${active ? `<span class="q-session-clock" id="q-session-clock">${clock(currentSessionSeconds())}</span><button class="button button-primary button-small" data-q-action="finish" ${disabled}>${qState.busy ? "Aguarde…" : "Encerrar sessão"}</button>` : `<button class="button button-primary" data-q-action="start" ${disabled}>${qState.busy ? "Aguarde…" : "Iniciar sessão de estudo"} <span aria-hidden="true">→</span></button>`}</div>
      </section>
      <div class="q-section-head q-catalog-heading"><div><span class="panel-kicker">BANCO DE QUESTÕES</span><h2>Qual matéria vamos praticar?</h2></div><span class="q-caption">60 questões autorais · 10 por matéria</span></div>
      <div class="q-subject-grid">${qState.subjects.map((s,i) => {
        const list = qState.bank.filter(q => q.subject === s);
        const count = list.filter(q => answerFor(q.id)).length;
        return `<button class="panel q-subject-card ${qState.subject === s ? "is-selected" : ""}" data-q-action="subject" data-subject="${esc(s)}" aria-pressed="${qState.subject === s}" ${disabled}>
          <span class="q-subject-copy"><strong>${esc(s)}</strong><small>10 questões · ${count} respondidas${active ? " na sessão" : ""}</small></span><span aria-hidden="true">↗</span><span class="q-card-track"><span style="width:${count * 10}%"></span></span></button>`;
      }).join("")}</div>
      ${qState.subject ? questionHtml(disabled) : '<div class="q-selection-hint">Selecione uma matéria acima para abrir suas questões.</div>'}
      ${reportHtml(active || qState.report, Boolean(active))}
      <section class="q-history"><div class="q-section-head"><div><span class="panel-kicker">SUAS SESSÕES</span><h2>Histórico de estudo</h2></div><span class="q-caption">Últimas 10 sessões</span></div>
      ${qState.history.length ? `<div class="q-history-list">${qState.history.map(s => `<button class="panel q-history-item" data-q-action="history" data-id="${s.id}" ${disabled}>
        <span><strong>${esc(new Date(s.startedAt).toLocaleString("pt-BR", {dateStyle: "short", timeStyle: "short"}))}</strong><small>${esc(s.subjects.map(g => g.subject).join(", ") || "Sem respostas")}</small></span><span>${s.correct}/${s.total} acertos</span><strong>${s.percentage}%</strong><span>${clock(s.seconds)}</span><span aria-hidden="true">→</span></button>`).join("")}</div>` : '<div class="panel q-empty"><strong>Nenhuma sessão concluída.</strong><p>Inicie uma sessão, resolva questões e encerre para salvar seu desempenho. Respostas avulsas ficam fora deste histórico.</p></div>'}
      </section>`;
  }
  function questionHtml(disabled) {
    const list = qState.bank.filter(q => q.subject === qState.subject);
    const q = list[qState.index];
    if (!q) return "";
    const result = answerFor(q.id);
    return `<section class="panel q-player" aria-label="Questão de ${esc(q.subject)}">
      <div class="q-section-head"><div><span class="panel-kicker">${esc(q.subject.toUpperCase())} · ${esc(q.topic.toUpperCase())}</span><h2>Questão ${q.number}<span class="q-caption"> de 10</span></h2></div><span class="q-mode">${qState.active ? "Nesta sessão" : "Avulsa"}</span></div>
      <nav class="q-number-nav" aria-label="Escolher questão">${list.map((item,i) => {
        const a = answerFor(item.id);
        return `<button class="q-number ${i === qState.index ? "current" : ""} ${a ? (a.correct ? "answered-correct" : "answered-wrong") : ""}" data-q-action="number" data-index="${i}" aria-label="Questão ${i+1}${a ? (a.correct ? ", acertada" : ", errada") : ""}" ${i === qState.index ? 'aria-current="step"' : ""} ${disabled}>${i+1}</button>`;
      }).join("")}</nav>
      <p class="q-prompt" id="q-prompt">${esc(q.prompt)}</p>
      <fieldset class="q-options" aria-labelledby="q-prompt"><legend class="sr-only">Selecione uma alternativa</legend>${q.options.map((option,i) => `<label class="q-option ${result && i === result.answer ? "is-correct" : ""} ${result && i === result.selected && !result.correct ? "is-wrong" : ""} ${!result && qState.selected === i ? "is-picked" : ""}">
        <input type="radio" name="q-option" value="${i}" ${(result ? result.selected : qState.selected) === i ? "checked" : ""} ${result || qState.busy ? "disabled" : ""}>
        <span class="q-option-letter">${letters[i]}</span><span>${esc(option)}</span>${result && i === result.answer ? '<span class="q-option-status">Correta ✓</span>' : result && i === result.selected ? '<span class="q-option-status">Sua resposta</span>' : ""}</label>`).join("")}</fieldset>
      ${result ? `<div class="q-feedback ${result.correct ? "correct" : "wrong"}" role="status"><strong>${result.correct ? "Você acertou!" : `A resposta correta é ${letters[result.answer]}.`}</strong><p>${esc(result.explanation)}</p></div>` : ""}
      <div class="q-player-actions"><button class="button button-outline button-small" data-q-action="previous" ${qState.index === 0 || qState.busy ? "disabled" : ""}>← Anterior</button>
      <div>${!result ? `<button class="button button-primary button-small" id="q-submit" data-q-action="answer" ${qState.selected === null || qState.busy ? "disabled" : ""}>${qState.busy ? "Salvando…" : "Confirmar resposta"}</button>` : !qState.active ? `<button class="button button-outline button-small" data-q-action="retry" ${disabled}>Tentar novamente</button>` : ""}
      <button class="button button-outline button-small" data-q-action="next" ${qState.index === 9 || qState.busy ? "disabled" : ""}>Próxima →</button></div></div>
      ${result && qState.index === 9 ? '<p class="q-caption">Fim desta matéria. Você pode revisar as questões ou escolher outra matéria acima.</p>' : ""}
    </section>`;
  }
  root.addEventListener("change", event => {
    if (!event.target.matches('input[name="q-option"]')) return;
    qState.selected = Number(event.target.value);
    root.querySelectorAll(".q-option").forEach(l => l.classList.toggle("is-picked", l.contains(event.target)));
    document.getElementById("q-submit").disabled = false;
  });
  root.addEventListener("click", async event => {
    const button = event.target.closest("[data-q-action]");
    if (!button || button.disabled || qState.busy) return;
    const action = button.dataset.qAction;
    if (action === "reload") { await load(); return; }
    if (["subject","number","previous","next","retry","history"].includes(action)) {
      pauseQuestion();
      if (action === "subject") { qState.subject = button.dataset.subject; qState.index = 0; }
      if (action === "number") qState.index = Number(button.dataset.index);
      if (action === "previous") qState.index = Math.max(0, qState.index - 1);
      if (action === "next") qState.index = Math.min(9, qState.index + 1);
      if (action === "retry") {
        qState.freeAnswers.delete(currentQuestion().id);
        qState.times.delete("free:" + currentQuestion().id);
      }
      if (action === "history") {
        if (qState.active) { showToast("Encerre a sessão atual para consultar um resumo anterior."); startQuestionClock(); return; }
        qState.report = qState.history.find(s => s.id === Number(button.dataset.id));
      }
      qState.selected = null; resetQuestionClock(); render();
      if (action === "subject") root.querySelector(".q-player")?.scrollIntoView({behavior: "smooth", block: "start"});
      if (action === "history") root.querySelector(".q-report")?.scrollIntoView({behavior: "smooth", block: "start"});
      return;
    }
    qState.busy = true; pauseQuestion(); render();
    try {
      if (action === "start") {
        applySessions(await api("/sessions", {}));
        qState.selected = null; resetQuestionClock(); showToast("Sessão iniciada. Escolha uma matéria e comece!");
      }
      if (action === "answer") {
        const q = currentQuestion();
        const sessionId = qState.active?.id || null;
        const result = await api("/answer", {questionId: q.id, selected: qState.selected, sessionId,
          seconds: Math.min(86400, Math.max(0, Math.floor(qState.viewedMs / 1000)))});
        if (sessionId) applySessions(await api("/sessions"));
        else qState.freeAnswers.set(q.id, result);
      }
      if (action === "finish") {
        const data = await api(`/sessions/${qState.active.id}/finish`, {});
        applySessions(data); qState.report = data.summary;
        qState.subject = null; qState.selected = null; qState.freeAnswers.clear();
        showToast("Sessão encerrada. Seu resumo foi salvo.");
      }
    } catch (error) { showToast(error.message); }
    finally {
      qState.busy = false; startQuestionClock(); render();
      if (action === "finish" && !qState.active) root.querySelector(".q-report")?.scrollIntoView({behavior: "smooth", block: "start"});
    }
  });
  window.addEventListener("studyforge:view", event => {
    pauseQuestion();
    if (event.detail === "questions") { startQuestionClock(); load(); }
  });
  document.addEventListener("visibilitychange", () => { pauseQuestion(); startQuestionClock(); });
  window.addEventListener("studyforge:logout", () => {
    pauseQuestion(); qState.epoch++; qState.loaded = false; qState.loading = false;
    qState.bank = []; qState.subjects = []; qState.active = null; qState.history = [];
    qState.busy = false; qState.report = null; qState.subject = null; qState.selected = null; qState.freeAnswers.clear();
    qState.times.clear(); qState.timedKey = null; qState.viewedMs = 0; qState.userId = null;
    root.innerHTML = '<div class="panel q-empty">Carregando questões…</div>';
  });
  setInterval(() => {
    if (!qState.active || state.currentView !== "questions") return;
    const time = clock(currentSessionSeconds());
    for (const id of ["q-session-clock", "q-report-clock"]) {
      const el = document.getElementById(id); if (el) el.textContent = time;
    }
  }, 1000);
})();
